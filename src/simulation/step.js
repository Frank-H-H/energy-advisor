// src/simulation/step.js

/**
 * Simulate a single timestep (interval).
 *
 * Inputs (in the call object):
 * - state: { battery_soc_kwh: number } (current state at interval start)
 * - interval: { start, end, durationMs, values: { expectedProductionPower, expectedConsumptionPower, targetGridPoint, prematureExportPower, extraConsumptionPower, extraConsumptionEndsAt, importPrice, exportPrice, ... } }
 * - components: { battery: { capacity_kwh, max_charge_power_kw, max_discharge_power_kw, charge_efficiency, discharge_efficiency, min_soc_kwh }, grid: { max_export_power_kw } }
 * - options: optional behavior flags
 *
 * Returns: { nextState, outputs, diagnostics }
 * - nextState: { battery_soc_kwh }
 * - outputs: { exportedEnergy, importedEnergy, missedProduction, extraConsumedEnergy, consumption_kwh?, pv_kwh?, battery_charge_kwh?, battery_discharge_kwh?, battery_soc_kwh, importPrice, exportPrice, cost, revenue }
 */

export function simulateTimestep({ state = {}, interval, components = {}, options = {} }) {
  if (!interval || !interval.start || !interval.end) {
    throw new Error('interval with start and end required')
  }

  const durationMs = interval.durationMs ?? (new Date(interval.end).getTime() - new Date(interval.start).getTime())
  const durationH = durationMs / 3600000

  const vals = interval.values || {}

  // Accept multiple naming variants used in flows/tests
  const expectedProductionPower = Number(vals.expectedProductionPower ?? vals.expectedProduction ?? 0)
  const expectedConsumptionPower = Number(vals.expectedConsumptionPower ?? vals.expectedConsumption ?? 0)
  const targetGridPoint = Number(vals.targetGridPoint ?? vals.targetGrid ?? 0)
  const prematureExportPower = Number(vals.prematureExportPower ?? 0)
  const extraConsumptionPower = Number(vals.extraConsumptionPower ?? vals.extraConsumption ?? 0)
  const extraConsumptionEndsAt = vals.extraConsumptionEndsAt ? new Date(vals.extraConsumptionEndsAt) : undefined

  const importPrice = vals.importPrice ?? null
  const exportPrice = vals.exportPrice ?? null

  const batterySpec = components.battery || {}
  const gridSpec = components.grid || {}

  const capacity = Number(batterySpec.capacity_kwh ?? batterySpec.KWH_TOTAL_BATTERY_CAPACITY ?? Infinity)
  const maxChargePower = Number(batterySpec.max_charge_power_kw ?? batterySpec.max_charge_kw ?? batterySpec.KW_MAX_BATTERY_CHARGE ?? Infinity)
  const maxDischargePower = Number(batterySpec.max_discharge_power_kw ?? batterySpec.max_discharge_kw ?? maxChargePower)
  const chargeEff = Number(batterySpec.charge_efficiency ?? batterySpec.chargeEff ?? 1)
  const dischargeEff = Number(batterySpec.discharge_efficiency ?? batterySpec.dischargeEff ?? 1)
  const minSoc = Number(batterySpec.min_soc_kwh ?? 0)

  const maxExport = Number(gridSpec.max_export_power_kw ?? gridSpec.KW_MAX_EXPORT_POWER ?? Infinity)

  // Read starting SOC from state or fallback to battery spec
  let socStart = Number(state.battery_soc_kwh ?? state.batteryChargeAtStart ?? batterySpec.soc_kwh ?? 0)

  // Compute unconstrained power balance (kW)
  let powerBalance = expectedProductionPower - expectedConsumptionPower + targetGridPoint
  if (prematureExportPower) powerBalance -= prematureExportPower

  // If extra consumption ends after interval end (or no end provided), treat extra as active
  let extraConsumedEnergy = 0
  const extraActive = extraConsumptionPower && (!extraConsumptionEndsAt || extraConsumptionEndsAt >= new Date(interval.end))
  if (extraActive) {
    powerBalance -= extraConsumptionPower
    extraConsumedEnergy = extraConsumptionPower * durationH
  }

  // Constrain power balance by export capability (only for export > 0)
  const constrainedPowerBalance = Number.isFinite(maxExport) ? Math.min(powerBalance, maxExport) : powerBalance

  // Missed production (kWh) = amount of production that couldn't be exported due to export limit
  const missedProduction = Math.max(0, Math.min(expectedProductionPower, Math.max(0, powerBalance - constrainedPowerBalance))) * durationH

  // Determine battery-limited power (kW) we can apply (clamp to battery power limits)
  const batteryPowerLimit = Math.min(maxChargePower, maxDischargePower)
  // But we need to allow asymmetric charge/discharge caps
  let limitedBatteryPower = powerBalance
  if (limitedBatteryPower > maxChargePower) limitedBatteryPower = maxChargePower
  if (limitedBatteryPower < -maxDischargePower) limitedBatteryPower = -maxDischargePower

  // Energy change requested for battery (kWh before efficiencies handling)
  let requestedBatteryEnergy_kWh = limitedBatteryPower * durationH

  // Apply efficiencies: interpret requestedBatteryEnergy_kWh positive as energy 'from source' that will be stored after chargeEff
  // To keep things simple and consistent with existing node behavior, apply efficiencies as:
  // - Charging: energy_into_soc = requestedBatteryEnergy_kWh * chargeEff
  // - Discharging: energy_removed_from_soc = requestedBatteryEnergy_kWh (negative) (we treat efficiency on delivery side if needed)

  let batteryEnergyDelta = 0
  if (requestedBatteryEnergy_kWh >= 0) {
    batteryEnergyDelta = requestedBatteryEnergy_kWh * chargeEff
  } else {
    // requestedBatteryEnergy_kWh negative: we remove from SOC before applying discharge efficiency
    // amount removed from SOC = Math.abs(requestedBatteryEnergy_kWh)
    // delivered to load = removed * dischargeEff (not used here directly)
    batteryEnergyDelta = requestedBatteryEnergy_kWh // negative value; SOC will reduce by this magnitude
  }

  // Tentative end SOC before clamping
  let socTentative = socStart + batteryEnergyDelta

  // Clamp SOC to [minSoc, capacity]
  let socEnd = socTentative
  if (socEnd > capacity) socEnd = capacity
  if (socEnd < minSoc) socEnd = minSoc

  // Compute actual battery energy change applied
  const batteryEnergyApplied = socEnd - socStart // kWh (can be negative)

  // Compute net supply over interval (kWh): positive means surplus (production+target > consumption)
  const netSupply_kWh = powerBalance * durationH

  // The remainder after battery application goes to grid import/export (kWh)
  const remainder = netSupply_kWh - batteryEnergyApplied
  let exportedEnergy = 0
  let importedEnergy = 0
  if (remainder > 0) exportedEnergy = remainder
  else importedEnergy = -remainder

  // Compute costs/revenue
  const cost = importedEnergy * (importPrice ?? 0)
  const revenue = exportedEnergy * (exportPrice ?? 0)

  const outputs = {
    start: interval.start,
    end: interval.end,
    durationMs,
    // best-effort mirror of previous node fields
    exportedEnergy: Number(Number(exportedEnergy ?? 0).toFixed(12)),
    importedEnergy: Number(Number(importedEnergy ?? 0).toFixed(12)),
    missedProduction: Number(Number(missedProduction ?? 0).toFixed(12)),
    extraConsumedEnergy: Number(Number(extraConsumedEnergy ?? 0).toFixed(12)),
    // convenience fields
    battery_charge_kwh: batteryEnergyApplied > 0 ? Number(Number(batteryEnergyApplied).toFixed(12)) : 0,
    battery_discharge_kwh: batteryEnergyApplied < 0 ? Number(Number(-batteryEnergyApplied).toFixed(12)) : 0,
    battery_soc_kwh: Number(Number(socEnd).toFixed(12)),
    importPrice,
    exportPrice,
    cost: Number(Number(cost).toFixed(12)),
    revenue: Number(Number(revenue).toFixed(12))
  }

  const diagnostics = {
    powerBalance,
    constrainedPowerBalance,
    limitedBatteryPower,
    requestedBatteryEnergy_kWh,
    batteryEnergyApplied,
    netSupply_kWh
  }

  const nextState = { battery_soc_kwh: outputs.battery_soc_kwh }

  return { nextState, outputs, diagnostics }
}
