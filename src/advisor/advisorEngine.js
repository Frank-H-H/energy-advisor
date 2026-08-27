/**
 * Simple advisor engine that demonstrates look-ahead reasoning.
 * It scans the forecast for negative import prices in future intervals and
 * recommends discharging the battery before such periods to create capacity when beneficial.
 */

export class AdvisorEngine {
  /**
   * forecast: array of intervals produced by ForecastEngine
   * components: optional component configs (to estimate capacity)
   */
  static run({ forecast, components }) {
    const recs = []
    const batteryCfg = components?.battery
    if (!batteryCfg) return recs

    const capacity = batteryCfg.capacity_kwh

    // Find intervals with negative import price
    const negIntervals = forecast.filter(iv => (iv.values?.importPrice ?? 0) < 0)
    if (negIntervals.length === 0) return recs

    // For simplicity, consider the first negative interval block
    const firstNeg = negIntervals[0]
    const negIndex = forecast.findIndex(iv => iv.start === firstNeg.start)

    // Estimate expected "need for free capacity" during negative periods.
    // We want to capture two sources:
    //  1) PV surplus that would need battery capacity (pv_kwh - consumption_kwh > 0)
    //  2) If the import price is negative, it's economical to CHARGE from the grid during the negative price interval
    //     therefore we also estimate potential grid-charge as the interval's consumption (or available charging window).
    // The heuristic below sums (pv surplus) + (consumption during negative price windows) to produce a target capacity need.
    const neededCapacity = negIntervals.reduce((acc, iv) => {
      const pv = Number(iv.values?.pv_kwh ?? 0)
      const cons = Number(iv.values?.consumption_kwh ?? 0)
      const pvSurplus = Math.max(0, pv - cons)
      const gridChargePotential = (Number(iv.values?.importPrice ?? 0) < 0) ? Math.max(0, cons) : 0
      return acc + pvSurplus + gridChargePotential
    }, 0)

    // Available free capacity just before negative period
    const beforeIv = forecast[Math.max(0, negIndex - 1)]
    const socBefore = beforeIv?.values?.battery_soc_kwh ?? (batteryCfg.soc_kwh ?? 0)
    const freeCapacityBefore = Math.max(0, capacity - socBefore)

    if (freeCapacityBefore >= neededCapacity) {
      // No action needed
      return recs
    }

    const deficit = neededCapacity - freeCapacityBefore
    // Recommend discharging in the interval immediately before the negative period
    const targetIv = beforeIv
    if (!targetIv) return recs

    const energyToDischarge = Math.min(deficit, Math.max(0, socBefore - (batteryCfg.min_soc_kwh ?? 0)))
    if (energyToDischarge <= 0) return recs

    recs.push({
      timestamp: targetIv.start,
      durationMs: targetIv.durationMs,
      component: 'battery',
      action: 'DISCHARGE',
      energy_kwh: Number(energyToDischarge.toFixed(6)),
      reason: 'CREATE_BATTERY_CAPACITY',
      expectedBenefit: {
        estimatedSavedCost: energyToDischarge * Math.abs(firstNeg.values.importPrice || 0)
      },
      priority: 'medium',
      confidence: 0.75
    })

    return recs
  }
}
