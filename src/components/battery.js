/**
 * Battery domain model.
 * capacity_kwh: kWh
 * soc_kwh: kWh (initial)
 * min_soc_kwh: kWh
 * max_charge_power_kw: kW (external / AC side)
 * max_discharge_power_kw: kW (external / AC side)
 * charge_efficiency_curve: [{ up_to_kw, efficiency }] power dependent charge efficiency
 * discharge_efficiency_curve: [{ up_to_kw, efficiency }] power dependent discharge efficiency
 *
 * Efficiencies are configured exclusively via the power dependent curves.
 * A curve with a single point at up_to_kw 0 acts as a constant efficiency.
 * Without a configured curve the battery behaves loss-free. New battery
 * config nodes default to a 97% charge and discharge efficiency from 0 kW
 * upwards (see src/configs/schemas.js).
 */

/**
 * Normalize an efficiency curve given either as array of points or as JSON
 * string (as stored by the Node-RED config node).
 *
 * Points must provide `up_to_kw` (>= 0) and `efficiency` (0 < e <= 1).
 * Invalid points are dropped. Points are sorted by `up_to_kw`; later
 * duplicates of the same `up_to_kw` are dropped.
 *
 * Returns null when no valid points remain (=> loss-free fallback).
 */
export function normalizeEfficiencyCurve(curve) {
  if (typeof curve === 'string') {
    if (curve.trim() === '') return null
    try {
      curve = JSON.parse(curve)
    } catch {
      return null
    }
  }
  if (!Array.isArray(curve)) return null

  const points = []
  for (const entry of curve) {
    if (!entry || typeof entry !== 'object') continue
    const upToKw = Number(entry.up_to_kw ?? entry.upToKw)
    const efficiency = Number(entry.efficiency ?? entry.value)
    if (!Number.isFinite(upToKw) || upToKw < 0) continue
    if (!Number.isFinite(efficiency) || efficiency <= 0 || efficiency > 1) {
      continue
    }
    points.push({ up_to_kw: upToKw, efficiency })
  }

  points.sort((first, second) => first.up_to_kw - second.up_to_kw)

  const unique = []
  for (const point of points) {
    const previous = unique[unique.length - 1]
    if (previous && previous.up_to_kw === point.up_to_kw) continue
    unique.push(point)
  }

  return unique.length > 0 ? unique : null
}

/**
 * Look up the efficiency for a given (absolute) power.
 * Linear interpolation between curve points, clamping below the first and
 * above the last point. Falls back to `fallback` when no curve is configured.
 */
export function lookupEfficiency(curve, powerKw, fallback = 1) {
  const points = normalizeEfficiencyCurve(curve)
  if (!points) {
    const scalar = Number(fallback)
    if (!Number.isFinite(scalar) || scalar <= 0) return 1
    return Math.min(scalar, 1)
  }

  const power = Math.abs(Number(powerKw) || 0)
  const first = points[0]
  const last = points[points.length - 1]

  if (power <= first.up_to_kw) return first.efficiency
  if (power >= last.up_to_kw) return last.efficiency

  for (let index = 0; index < points.length - 1; index++) {
    const lower = points[index]
    const upper = points[index + 1]
    if (power <= upper.up_to_kw) {
      const range = upper.up_to_kw - lower.up_to_kw
      const t = (power - lower.up_to_kw) / range
      return lower.efficiency + t * (upper.efficiency - lower.efficiency)
    }
  }

  return last.efficiency
}

export class Battery {
  constructor(cfg = {}) {
    this.capacity = Number(cfg.capacity_kwh || 0)
    this.soc = Number(cfg.soc_kwh ?? 0)
    this.minSoc = Number(cfg.min_soc_kwh ?? 0)
    this.maxChargePower = Number(cfg.max_charge_power_kw ?? Infinity)
    this.maxDischargePower = Number(cfg.max_discharge_power_kw ?? Infinity)
    this.chargeEfficiencyCurve = normalizeEfficiencyCurve(
      cfg.charge_efficiency_curve
    )
    this.dischargeEfficiencyCurve = normalizeEfficiencyCurve(
      cfg.discharge_efficiency_curve
    )

    if (this.soc > this.capacity) this.soc = this.capacity
    if (this.soc < this.minSoc) this.soc = this.minSoc
  }

  availableCapacityKWh() {
    return Math.max(0, this.capacity - this.soc)
  }

  availableDischargeKWh() {
    return Math.max(0, this.soc - this.minSoc)
  }

  /**
   * Effective charge efficiency for the given external charge power.
   * Without a configured curve the battery charges loss-free.
   */
  chargeEfficiencyAt(powerKw) {
    return lookupEfficiency(this.chargeEfficiencyCurve, powerKw, 1)
  }

  /**
   * Effective discharge efficiency for the given external discharge power.
   * Without a configured curve the battery discharges loss-free.
   */
  dischargeEfficiencyAt(powerKw) {
    return lookupEfficiency(this.dischargeEfficiencyCurve, powerKw, 1)
  }

  /**
   * Apply a power for a relative duration in hours.
   * Positive power charges, negative power discharges.
   *
   * Power is interpreted on the external (AC) side: limits and the returned
   * `externalEnergyKwh` refer to the energy flowing at the grid/PV side.
   * `energyKWh` is the resulting SOC energy change:
   * - charging:  soc gain = external energy * charge efficiency
   * - discharging: soc loss = external energy / discharge efficiency
   *
   * The battery enforces its own power and SOC limits. Efficiencies are
   * taken from the configured power dependent curves; without a curve the
   * battery behaves loss-free.
   */
  applyPower(powerKw, durationHours) {
    if (!Number.isFinite(powerKw)) {
      throw new Error('powerKw must be finite')
    }
    if (!Number.isFinite(durationHours) || durationHours < 0) {
      throw new Error('durationHours must be a finite number >= 0')
    }

    const socAtStartKWh = this.soc
    const result = {
      requestedPowerKw: powerKw,
      appliedPowerKw: 0,
      requestedDurationHours: durationHours,
      actualDurationHours: durationHours,
      energyKWh: 0,
      externalEnergyKwh: 0,
      efficiency: 1,
      chargeLossKwh: 0,
      dischargeLossKwh: 0,
      socAtStartKWh,
      socAtEndKWh: this.soc,
      reachedFullAtHours: null,
      reachedEmptyAtHours: null,
    }

    if (durationHours === 0 || powerKw === 0) {
      return result
    }

    const appliedPowerKw =
      powerKw > 0
        ? Math.min(powerKw, this.maxChargePower)
        : Math.max(powerKw, -this.maxDischargePower)

    result.appliedPowerKw = appliedPowerKw

    const efficiency =
      appliedPowerKw > 0
        ? this.chargeEfficiencyAt(appliedPowerKw)
        : this.dischargeEfficiencyAt(-appliedPowerKw)
    result.efficiency = efficiency

    if (appliedPowerKw > 0) {
      // SOC gain rate is reduced by the charge efficiency.
      const socChargePowerKw = appliedPowerKw * efficiency
      const timeToFullHours = this.availableCapacityKWh() / socChargePowerKw

      if (timeToFullHours <= durationHours) {
        result.actualDurationHours = timeToFullHours
        result.reachedFullAtHours = timeToFullHours
      }
    } else if (appliedPowerKw < 0) {
      // More SOC energy is drawn than delivered externally.
      const socDischargePowerKw = -appliedPowerKw / efficiency
      const timeToEmptyHours =
        this.availableDischargeKWh() / socDischargePowerKw

      if (timeToEmptyHours <= durationHours) {
        result.actualDurationHours = timeToEmptyHours
        result.reachedEmptyAtHours = timeToEmptyHours
      }
    }

    result.externalEnergyKwh = appliedPowerKw * result.actualDurationHours
    result.energyKWh =
      appliedPowerKw > 0
        ? result.externalEnergyKwh * efficiency
        : result.externalEnergyKwh / efficiency
    // Avoid exposing JavaScript's -0 when no energy is transferred.
    if (Object.is(result.energyKWh, -0)) result.energyKWh = 0
    if (appliedPowerKw > 0) {
      result.chargeLossKwh = result.externalEnergyKwh * (1 - efficiency)
    } else if (appliedPowerKw < 0) {
      result.dischargeLossKwh =
        -result.externalEnergyKwh * (1 / efficiency - 1)
    }
    this.soc += result.energyKWh
    this.soc = Math.max(this.minSoc, Math.min(this.capacity, this.soc))
    result.socAtEndKWh = this.soc

    return result
  }
}
