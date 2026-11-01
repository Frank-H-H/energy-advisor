import { describe, expect, it } from 'vitest';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { ImmediateNegativePriceExportStrategy } from '../../src/advisor/strategies/immediateNegativePriceExportStrategy.js';

function run(strategy, timeSeries) {
  return AdvisorEngine.run({ timeSeries, strategies: [strategy] });
}

function timestep(startMinute, spotPerKwh, exportKwh, targetPowerKw = 0) {
  const start = new Date(
    '2026-01-01T00:' + String(startMinute).padStart(2, '0') + ':00Z'
  );
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    grid: {
      spotPerKwh,
      exportKwh,
      targetPowerKw,
    },
  };
}

describe('ImmediateNegativePriceExportStrategy', () => {
  it('creates a set-grid-target action for excess export in a negative-price timestep', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const plan = run(
      new ImmediateNegativePriceExportStrategy(),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.strategyId).toBe('immediate-negative-price-export');
    expect(strategyPlan.proposals).toHaveLength(1);
    expect(strategyPlan.proposals[0]).toMatchObject({
      strategyId: 'immediate-negative-price-export'
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      type: 'set-grid-target',
      gridTargetPowerKw: -7,
      reason: 'AVOID_NEGATIVE_PRICE_EXPORT',
    });
    expect(plan.actions[0].start.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(plan.actions[0].end.toISOString()).toBe(
      '2026-01-01T00:15:00.000Z'
    );
    expect(strategyPlan.remainingExportEnergyKwh).toBe(0);
    expect(strategyPlan.totalPlannedExportEnergyKwh).toBeCloseTo(1.75, 10);
  });

  it('uses spot price instead of buy price to detect negative-price timesteps', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: { spotPerKwh: 0.2, buyPerKwh: 0.01, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T00:30:00Z',
        grid: { spotPerKwh: -0.1, buyPerKwh: 0.5, exportKwh: 2, targetPowerKw: -1 },
      },
    ];
    const plan = run(
      new ImmediateNegativePriceExportStrategy(),
      timeSeries
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
  });

  it('uses the existing grid target when creating the new target', () => {
    const timeSeries = [timestep(0, 0.2, 0, 2), timestep(15, -0.1, 2, -1)];
    const plan = run(
      new ImmediateNegativePriceExportStrategy(),
      timeSeries
    );

    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-5, 10);
  });

  it('does not move the part already covered by the target grid point', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -2)];
    const plan = run(
      new ImmediateNegativePriceExportStrategy(),
      timeSeries
    );

    expect(
      plan.strategyPlans[0].totalPlannedExportEnergyKwh
    ).toBeCloseTo(1.5, 10);
  });

  it('uses multiple earlier timesteps when one timestep cannot absorb all energy', () => {
    const timeSeries = [
      timestep(0, 0.2, 0),
      timestep(15, 0.3, 0),
      timestep(30, -0.1, 5),
    ];
    const plan = run(
      new ImmediateNegativePriceExportStrategy(),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.totalPlannedExportEnergyKwh).toBeCloseTo(3.73, 10);
    expect(strategyPlan.remainingExportEnergyKwh).toBeCloseTo(1.27, 10);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7.46, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(-7.46, 10);
  });

  it('uses TimeSeries duration even when timestep lengths differ', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T01:15:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 3, targetPowerKw: 0 },
      },
    ];

    const plan = run(
      new ImmediateNegativePriceExportStrategy({ maxExportPowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-4, 10);
    expect(
      plan.strategyPlans[0].totalPlannedExportEnergyKwh
    ).toBeCloseTo(1, 10);
    expect(
      plan.strategyPlans[0].remainingExportEnergyKwh
    ).toBeCloseTo(2, 10);
  });

  it('rejects a timestep with non-positive duration', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:00:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 1, targetPowerKw: 0 },
      },
    ];

    expect(() =>
      run(new ImmediateNegativePriceExportStrategy(), timeSeries)
    ).toThrow('TimeSeries timestep must have a positive duration');
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const original = structuredClone(timeSeries);
    run(new ImmediateNegativePriceExportStrategy(), timeSeries);
    expect(timeSeries).toEqual(original);
  });

  it('uses the actual timestep duration together with the configured export power', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:30:00Z',
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T00:30:00Z',
        end: '2026-01-01T01:00:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: 0 },
      },
    ];

    const plan = run(
      new ImmediateNegativePriceExportStrategy({
        maxExportPowerKw: 4,
      }),
      timeSeries
    );

    expect(plan.actions[0].gridTargetPowerKw).toBe(-4);
  });
});
