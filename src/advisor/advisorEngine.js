import { PlanBuilder } from './plan-builder.js'

/**
 * Runs all active strategies against one simulation TimeSeries and combines
 * their proposals into one executable-by-another-system Plan.
 */
export class AdvisorEngine {
  static run({ timeSeries, strategies = [] } = {}) {
    if (!Array.isArray(timeSeries)) throw new Error('timeSeries must be an array')
    if (!Array.isArray(strategies)) throw new Error('strategies must be an array')

    const strategyPlans = strategies.map((strategy) => {
      if (!strategy || typeof strategy.createPlan !== 'function') {
        throw new Error('every strategy must implement createPlan(timeSeries)')
      }
      return strategy.createPlan(timeSeries)
    })

    return new PlanBuilder().build(strategyPlans)
  }
}
