import { describe, expect, it } from 'vitest';
import { Action } from '../../src/advisor/action.js';
import { ActionProposal } from '../../src/advisor/action-proposal.js';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { Strategy } from '../../src/advisor/strategy.js';

class TestStrategy extends Strategy {
  constructor(id, start, end, gridTargetPowerKw, priority = 50) {
    super();
    this._id = id;
    this.start = start;
    this.end = end;
    this.gridTargetPowerKw = gridTargetPowerKw;
    this.priority = priority;
  }

  get id() {
    return this._id;
  }

  createPlan(_timeSeries) {
    return {
      strategyId: this.id,
      proposals: [
        new ActionProposal({
          strategyId: this.id,
          priority: this.priority,
          action: new Action({
            type: 'set-grid-target',
            start: this.start,
            end: this.end,
            gridTargetPowerKw: this.gridTargetPowerKw,
            confidence: 1,
          }),
        }),
      ],
    };
  }
}

describe('AdvisorEngine', () => {
  it('runs all active strategies and returns one Plan', () => {
    const plan = AdvisorEngine.run({
      timeSeries: [],
      strategies: [
        new TestStrategy(
          'buy-cheap',
          '2026-01-01T00:00:00Z',
          '2026-01-01T00:15:00Z',
          5
        ),
        new TestStrategy(
          'sell-expensive',
          '2026-01-01T01:00:00Z',
          '2026-01-01T01:15:00Z',
          -5
        ),
      ],
    });

    expect(plan.actions).toHaveLength(2);
    expect(plan.strategyPlans).toHaveLength(2);
  });
});
