import { describe, expect, it } from 'vitest';
import { Action } from '../../src/advisor/action.js';
import { ActionProposal } from '../../src/advisor/action-proposal.js';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { Strategy } from '../../src/advisor/strategy.js';
import { ImmediateNegativePriceExportStrategy } from '../../src/advisor/strategies/immediateNegativePriceExportStrategy.js';
import { DistributedNegativePriceExportStrategy } from '../../src/advisor/strategies/distributedNegativePriceExportStrategy.js';

/** Proposes fixed actions for exactly the timesteps they match. */
class FixedActionStrategy extends Strategy {
  constructor(id, actions, priority = 50) {
    super();
    this._id = id;
    this.actions = actions;
    this.priority = priority;
  }

  get id() {
    return this._id;
  }

  planTimestep(timestep) {
    const start = new Date(timestep.start).getTime();
    const end = new Date(timestep.end).getTime();
    return this.actions
      .filter(
        (action) =>
          new Date(action.start).getTime() === start &&
          new Date(action.end).getTime() === end
      )
      .map(
        (action) =>
          new ActionProposal({
            strategyId: this.id,
            priority: this.priority,
            action: new Action({
              type: 'set-grid-target',
              start: action.start,
              end: action.end,
              gridTargetPowerKw: action.gridTargetPowerKw,
              confidence: 1,
            }),
          })
      );
  }
}

/** Adds a fixed export delta on top of the current working target. */
class AddExportStrategy extends Strategy {
  constructor(id, deltaKw, priority = 50) {
    super();
    this._id = id;
    this.deltaKw = deltaKw;
    this.priority = priority;
  }

  get id() {
    return this._id;
  }

  planTimestep(timestep) {
    const currentTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
    return [
      new ActionProposal({
        strategyId: this.id,
        priority: this.priority,
        action: new Action({
          type: 'set-grid-target',
          start: timestep.start,
          end: timestep.end,
          gridTargetPowerKw: currentTargetPowerKw - this.deltaKw,
          confidence: 1,
        }),
      }),
    ];
  }
}

/** Proposes one action that spans an already planned timestep. */
class OverlappingStrategy extends Strategy {
  get id() {
    return 'overlapping';
  }

  planTimestep(timestep, context) {
    if (context.index !== 1) return [];
    const first = context.series[0];
    return [
      new ActionProposal({
        strategyId: this.id,
        priority: 90,
        action: new Action({
          type: 'set-grid-target',
          start: first.start,
          end: timestep.end,
          gridTargetPowerKw: -5,
          confidence: 1,
        }),
      }),
    ];
  }
}

/** Counts the timesteps it has seen in its run-scoped state. */
class StatefulStrategy extends Strategy {
  get id() {
    return 'stateful';
  }

  planTimestep(timestep, context) {
    context.state.seen = context.state.seen ?? [];
    context.state.seen.push(context.index);
    if (context.index !== 1) return [];
    return [
      new ActionProposal({
        strategyId: this.id,
        priority: 50,
        action: new Action({
          type: 'set-grid-target',
          start: timestep.start,
          end: timestep.end,
          gridTargetPowerKw: context.state.seen.length,
          confidence: 1,
        }),
      }),
    ];
  }
}

function timestep(start, end, targetPowerKw = 0) {
  return {
    start,
    end,
    grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw },
  };
}

const TS_0 = '2026-01-01T00:00:00Z';
const TS_15 = '2026-01-01T00:15:00Z';
const TS_30 = '2026-01-01T00:30:00Z';

describe('AdvisorEngine', () => {
  it('applies every configured strategy to every timestep and returns one Plan', () => {
    const plan = AdvisorEngine.run({
      timeSeries: [timestep(TS_0, TS_15), timestep(TS_15, TS_30)],
      strategies: [
        new FixedActionStrategy('buy-cheap', [
          { start: TS_0, end: TS_15, gridTargetPowerKw: 5 },
        ]),
        new FixedActionStrategy('sell-expensive', [
          { start: TS_15, end: TS_30, gridTargetPowerKw: -5 },
        ]),
      ],
    });

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions.map((action) => action.gridTargetPowerKw)).toEqual([
      5,
      -5,
    ]);
    expect(plan.strategyPlans).toHaveLength(2);
    expect(plan.strategyPlans.map((entry) => entry.strategyId)).toEqual([
      'buy-cheap',
      'sell-expensive',
    ]);
  });

  it('composes strategies within one timestep in the configured order', () => {
    const plan = AdvisorEngine.run({
      timeSeries: [timestep(TS_0, TS_15)],
      strategies: [
        new AddExportStrategy('first', 4),
        new AddExportStrategy('second', 2),
      ],
    });

    // The second strategy sees the target already set by the first one.
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBe(-4);
    expect(plan.actions[1].gridTargetPowerKw).toBe(-6);
  });

  it('rejects proposals that overlap actions accepted for other timesteps', () => {
    const plan = AdvisorEngine.run({
      timeSeries: [timestep(TS_0, TS_15), timestep(TS_15, TS_30)],
      strategies: [
        new FixedActionStrategy('first', [
          { start: TS_0, end: TS_15, gridTargetPowerKw: 5 },
        ]),
        new OverlappingStrategy(),
      ],
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBe(5);
    expect(plan.rejectedProposals).toHaveLength(1);
    expect(plan.rejectedProposals[0].reason).toBe('ACTION_CONFLICT');
    expect(
      plan.rejectedProposals[0].proposal.strategyId
    ).toBe('overlapping');
  });

  it('provides each strategy with its own state across timesteps', () => {
    const plan = AdvisorEngine.run({
      timeSeries: [timestep(TS_0, TS_15), timestep(TS_15, TS_30)],
      strategies: [new StatefulStrategy()],
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBe(2);
  });

  it('does not mutate the input timeSeries', () => {
    const timeSeries = [timestep(TS_0, TS_15)];
    const original = structuredClone(timeSeries);

    AdvisorEngine.run({
      timeSeries,
      strategies: [new AddExportStrategy('first', 4)],
    });

    expect(timeSeries).toEqual(original);
  });

  it('composes the negative-price export strategies within a timestep', () => {
    const timeSeries = [
      {
        start: TS_0,
        end: TS_15,
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: TS_15,
        end: TS_30,
        grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: -1 },
      },
    ];

    const plan = AdvisorEngine.run({
      timeSeries,
      strategies: [
        new ImmediateNegativePriceExportStrategy(),
        new DistributedNegativePriceExportStrategy(),
      ],
    });

    // The immediate strategy plans -7 kW (1.75 kWh). The distributed
    // strategy builds on the working target but is capped at the
    // configured maximum export power.
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(-7.46, 10);
    expect(
      plan.strategyPlans[1].totalPlannedExportEnergyKwh
    ).toBeCloseTo(0.115, 10);
  });

  it('validates its input', () => {
    expect(() =>
      AdvisorEngine.run({ timeSeries: null, strategies: [] })
    ).toThrow('timeSeries must be an array');
    expect(() =>
      AdvisorEngine.run({ timeSeries: [], strategies: null })
    ).toThrow('strategies must be an array');
    expect(() =>
      AdvisorEngine.run({ timeSeries: [], strategies: [{}] })
    ).toThrow('every strategy must implement planTimestep(timestep, context)');
  });
});

