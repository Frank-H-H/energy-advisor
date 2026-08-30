/**
 * Battery domain model.
 * capacity_kwh: kWh
 * soc_kwh: kWh (initial)
 * min_soc_kwh: kWh
 * max_charge_power_kw: kW
 * max_discharge_power_kw: kW
 */

export class Battery {
  constructor(cfg = {}) {
    this.capacity = Number(cfg.capacity_kwh || 0)
    this.soc = Number(cfg.soc_kwh ?? 0)
    this.minSoc = Number(cfg.min_soc_kwh ?? 0)
    this.maxChargePower = Number(cfg.max_charge_power_kw ?? Infinity)
    this.maxDischargePower = Number(cfg.max_discharge_power_kw ?? Infinity)

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
   * Apply a power for a relative duration in hours.
   * Positive power charges, negative power discharges.
   *
   * The battery enforces its own power and SOC limits. Efficiencies are
   * deliberately not modelled here.
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

    if (appliedPowerKw > 0) {
      const timeToFullHours =
        this.availableCapacityKWh() / appliedPowerKw

      if (timeToFullHours <= durationHours) {
        result.actualDurationHours = timeToFullHours
        result.reachedFullAtHours = timeToFullHours
      }
    } else if (appliedPowerKw < 0) {
      const timeToEmptyHours =
        this.availableDischargeKWh() / -appliedPowerKw

      if (timeToEmptyHours <= durationHours) {
        result.actualDurationHours = timeToEmptyHours
        result.reachedEmptyAtHours = timeToEmptyHours
      }
    }

    result.energyKWh = appliedPowerKw * result.actualDurationHours
    this.soc += result.energyKWh
    this.soc = Math.max(this.minSoc, Math.min(this.capacity, this.soc))
    result.socAtEndKWh = this.soc

    return result
  }
}
