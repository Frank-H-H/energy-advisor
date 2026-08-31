import { describe, expect, it } from 'vitest'
import { Action } from '../../src/advisor/action.js'
import { ActionProposal } from '../../src/advisor/action-proposal.js'
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js'
import { Strategy } from '../../src/advisor/strategy.js'

class TestStrategy extends Strategy {
  constructor(id, type, timestamp) {
    super()
    this._id = id
    this.type = type
    this.timestamp = timestamp
  }

  get id() {
    return this._id
  }

  createPlan(_timeSeries) {
    return {
      strategyId: this.id,
      proposals: [
        new ActionProposal({
          strategyId: this.id,
          action: new Action({
            timestamp: this.timestamp,
            durationMs: 15 * 60 * 1000,
            component: 'grid',
            type: this.type,
            energyKwh: 1,
            priority: 50,
            confidence: 1,
            resource: this.id,
          }),
        }),
      ],
    }
  }
}

describe('AdvisorEngine', () => {
  it('runs all active strategies and returns one Plan', () => {
    const timeSeries = []
    const plan = AdvisorEngine.run({
      timeSeries,
      strategies: [
        new TestStrategy('buy-cheap', 'charge-battery', '2026-01-01T00:00:00Z'),
        new TestStrategy('sell-expensive', 'discharge-battery', '2026-01-01T01:00:00Z'),
      ],
    })

    expect(plan.actions).toHaveLength(2)
    expect(plan.strategyPlans).toHaveLength(2)
    expect(plan.strategyPlans.map((item) => item.strategyId)).toEqual([
      'buy-cheap',
      'sell-expensive',
    ])
  })
})
