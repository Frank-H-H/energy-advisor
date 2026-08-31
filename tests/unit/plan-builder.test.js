import { describe, expect, it } from 'vitest'
import { Action } from '../../src/advisor/action.js'
import { ActionProposal } from '../../src/advisor/action-proposal.js'
import { PlanBuilder } from '../../src/advisor/plan-builder.js'

function proposal(strategyId, type, priority = 50) {
  return new ActionProposal({
    strategyId,
    action: new Action({
      timestamp: '2026-01-01T00:00:00.000Z',
      durationMs: 15 * 60 * 1000,
      component: 'battery',
      type,
      energyKwh: 1,
      priority,
      confidence: 1,
      resource: 'battery',
      exclusive: true,
    }),
  })
}

describe('PlanBuilder', () => {
  it('combines actions from multiple strategies', () => {
    const result = new PlanBuilder().build([
      { strategyId: 'buy-cheap', proposals: [proposal('buy-cheap', 'charge-battery')] },
      { strategyId: 'sell-expensive', proposals: [
        new ActionProposal({
          strategyId: 'sell-expensive',
          action: new Action({
            timestamp: '2026-01-01T01:00:00.000Z',
            durationMs: 15 * 60 * 1000,
            component: 'battery',
            type: 'discharge-battery',
            energyKwh: 1,
            priority: 50,
            confidence: 1,
            resource: 'battery',
            exclusive: true,
          }),
        }),
      ] },
    ])

    expect(result.actions.map((action) => action.type)).toEqual([
      'charge-battery',
      'discharge-battery',
    ])
  })

  it('rejects a lower-priority action that conflicts for an exclusive resource', () => {
    const result = new PlanBuilder().build([
      { strategyId: 'low', proposals: [proposal('low', 'charge-battery', 10)] },
      { strategyId: 'high', proposals: [proposal('high', 'discharge-battery', 90)] },
    ])

    expect(result.actions).toHaveLength(1)
    expect(result.actions[0].type).toBe('discharge-battery')
    expect(result.rejectedProposals).toHaveLength(1)
    expect(result.rejectedProposals[0].reason).toBe('RESOURCE_CONFLICT')
    expect(result.rejectedProposals[0].proposal.strategyId).toBe('low')
  })
})
