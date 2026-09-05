import { describe, expect, it } from 'vitest';
import { ImmediateNegativePriceExportStrategy } from '../../src/advisor/strategies/immediateNegativePriceExportStrategy.js';

function timestep(startMinute, spotPerKwh, exportKwh, targetPowerKw = 0) {
  const start = new Date(
    `2026-01-01T00:${String(startMinute).padStart(2, '0')}:00Z`
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
    const result = new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);

    expect(result.strategyId).toBe('immediate-negative-price-export');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      strategyId: 'immediate-negative-price-export',
      priority: 50,
    });
    expect(result.proposals[0].action).toMatchObject({
      type: 'set-grid-target',
      gridTargetPowerKw: -7,
      reason: 'AVOID_NEGATIVE_PRICE_EXPORT',
    });
    expect(result.proposals[0].action.start.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(result.proposals[0].action.end.toISOString()).toBe(
      '2026-01-01T00:15:00.000Z'
    );
    expect(result.remainingExportEnergyKwh).toBe(0);
    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(1.75, 10);
  });

  it('uses spot price instead of buy price to detect negative-price timesteps', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T00:30:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: -1 },
      },
    ];
    const result = new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-7, 10);
  });

  it('uses the existing grid target when creating the new target', () => {
    const timeSeries = [timestep(0, 0.2, 0, 2), timestep(15, -0.1, 2, -1)];
    const result = new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);

    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-5, 10);
  });

  it('does not move the part already covered by the target grid point', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -2)];
    const result = new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);

    expect(result.totalPlannedExportEnergyKwh).toBe(1.5);
  });

  it('uses multiple earlier timesteps when one timestep cannot absorb all energy', () => {
    const timeSeries = [
      timestep(0, 0.2, 0),
      timestep(15, 0.3, 0),
      timestep(30, -0.1, 5),
    ];
    const result = new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);

    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(3.73, 10);
    expect(result.remainingExportEnergyKwh).toBeCloseTo(1.27, 10);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-7.46, 10);
    expect(result.proposals[1].action.gridTargetPowerKw).toBeCloseTo(-7.46, 10);
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const original = structuredClone(timeSeries);
    new ImmediateNegativePriceExportStrategy().createPlan(timeSeries);
    expect(timeSeries).toEqual(original);
  });

  it('supports configured export power, timestep duration and priority', () => {
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

    const result = new ImmediateNegativePriceExportStrategy({
      maxExportPowerKw: 4,
      intervalMinutes: 30,
      priority: 80,
    }).createPlan(timeSeries);

    expect(result.proposals[0].priority).toBe(80);
    expect(result.proposals[0].action.gridTargetPowerKw).toBe(-4);
  });
});
