import { describe, expect, it } from 'vitest';
import { Action } from '../../src/advisor/action.js';
import { ActionProposal } from '../../src/advisor/action-proposal.js';
import { PlanBuilder } from '../../src/advisor/plan-builder.js';

function proposal(strategyId, start, end, gridTargetPowerKw, priority = 50) {
  return new ActionProposal({
    strategyId,
    priority,
    action: new Action({
      type: 'set-grid-target',
      start,
      end,
      gridTargetPowerKw,
      confidence: 1,
    }),
  });
}

describe('PlanBuilder', () => {
  it('combines actions from multiple strategies', () => {
    const result = new PlanBuilder().build([
      {
        strategyId: 'buy-cheap',
        proposals: [
          proposal(
            'buy-cheap',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:15:00Z',
            5
          ),
        ],
      },
      {
        strategyId: 'sell-expensive',
        proposals: [
          proposal(
            'sell-expensive',
            '2026-01-01T01:00:00Z',
            '2026-01-01T01:15:00Z',
            -5
          ),
        ],
      },
    ]);

    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((action) => action.gridTargetPowerKw)).toEqual([
      5, -5,
    ]);
  });

  it('rejects a lower-priority overlapping action', () => {
    const result = new PlanBuilder().build([
      {
        strategyId: 'low',
        proposals: [
          proposal(
            'low',
            '2026-01-01T00:00:00Z',
            '2026-01-01T00:15:00Z',
            5,
            10
          ),
        ],
      },
      {
        strategyId: 'high',
        proposals: [
          proposal(
            'high',
            '2026-01-01T00:05:00Z',
            '2026-01-01T00:20:00Z',
            -5,
            90
          ),
        ],
      },
    ]);

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].gridTargetPowerKw).toBe(-5);
    expect(result.rejectedProposals).toHaveLength(1);
    expect(result.rejectedProposals[0].reason).toBe('ACTION_CONFLICT');
    expect(result.rejectedProposals[0].proposal.strategyId).toBe('low');
  });
});
