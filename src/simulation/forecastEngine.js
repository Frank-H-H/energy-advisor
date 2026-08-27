import { DEFAULT_INTERVAL_MS } from "../time-series/timeSeries.js"
import { Battery } from "../components/battery.js"

export class ForecastEngine {
  /**
   * Run a simple deterministic forecast simulation.
   * input: { intervals: [ { start, end, durationMs, values: { consumption_kwh, pv_kwh, importPrice, exportPrice } } ], components: { battery: { ... } } }
   * Returns: forecast intervals with calculated fields
   */
  static run(input) {
    const intervals = input.intervals || []
    const batteryCfg = input.components?.battery
    const intervalMs = intervals.length ? intervals[0].durationMs : DEFAULT_INTERVAL_MS
    const hours = intervalMs / (1000 * 60 * 60)
    const battery = batteryCfg ? new Battery(batteryCfg) : null

    const out = []
    for (const iv of intervals) {
      const c = iv.values || {}
      const consumption = Number(c.consumption_kwh ?? 0)
      const pv = Number(c.pv_kwh ?? 0)
      const importPrice = c.importPrice ?? null
      const exportPrice = c.exportPrice ?? null

      // Start with PV used for consumption
      const pvForConsumption = Math.min(pv, consumption)
      let remainingConsumption = consumption - pvForConsumption
      let pvSurplus = Math.max(0, pv - pvForConsumption)

      let batteryChargeKWh = 0
      let batteryDischargeKWh = 0
      let gridImportKWh = 0
      let gridExportKWh = 0

      // If battery exists, try to charge from surplus
      if (battery && pvSurplus > 0) {
        const { chargedKWh, sourceKWh } = battery.charge(pvSurplus)
        batteryChargeKWh = chargedKWh
        pvSurplus -= sourceKWh - (sourceKWh - chargedKWh) // conservative
        // any leftover PV after charging goes to export
      }

      // If consumption remains, try to discharge battery
      if (battery && remainingConsumption > 0) {
        const { dischargedKWh, deliveredKWh } = battery.discharge(remainingConsumption / (battery?.dischargeEff ?? 1))
        // battery.discharge expects requested pre-efficiency; deliveredKWh goes to consumption
        const delivered = deliveredKWh
        batteryDischargeKWh = dischargedKWh
        remainingConsumption = Math.max(0, remainingConsumption - delivered)
      }

      // After battery interactions, remaining consumption is imported
      if (remainingConsumption > 0) {
        gridImportKWh = remainingConsumption
      }

      // any remaining PV surplus becomes export
      gridExportKWh = Math.max(0, pv - pvForConsumption - batteryChargeKWh / (battery?.chargeEff ?? 1))

      // Energy accounting (simple)
      const costs = (gridImportKWh || 0) * (importPrice ?? 0)
      const revenues = (gridExportKWh || 0) * (exportPrice ?? 0)

      out.push({
        start: iv.start,
        end: iv.end,
        durationMs: iv.durationMs,
        values: {
          consumption_kwh: consumption,
          pv_kwh: pv,
          battery_soc_kwh: battery ? battery.soc : null,
          battery_charge_kwh: batteryChargeKWh,
          battery_discharge_kwh: batteryDischargeKWh,
          grid_import_kwh: gridImportKWh,
          grid_export_kwh: gridExportKWh,
          importPrice,
          exportPrice,
          cost: costs,
          revenue: revenues
        }
      })
    }
    return out
  }
}
