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

    // Estimate expected PV surplus during negative period
    const neededCapacity = negIntervals.reduce((acc, iv) => {
      const surplus = Math.max(0, (iv.values?.pv_kwh ?? 0) - (iv.values?.consumption_kwh ?? 0))
      return acc + surplus
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
