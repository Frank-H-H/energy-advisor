import { describe, expect, it } from 'vitest';
import { PrematureExportStrategy } from '../../src/advisor/strategies/prematureExportStrategy.js';

function timestep(
  startMinute,
  importPrice,
  exportedEnergyKwh,
  gridTargetPowerKw = 0
) {
  const start = new Date(
    `2026-01-01T00:${String(startMinute).padStart(2, '0')}:00Z`
  );
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    values: {
      importPrice,
      grid_export_kwh: exportedEnergyKwh,
      gridTargetPowerKw,
    },
  };
}

describe('PrematureExportStrategy', () => {
  it('creates a set-grid-target action for excess export in a negative-price timestep', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.strategyId).toBe('premature-export');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      strategyId: 'premature-export',
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

  it('uses the existing grid target when creating the new target', () => {
    const timeSeries = [timestep(0, 0.2, 0, 2), timestep(15, -0.1, 2, -1)];
    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-5, 10);
  });

  it('does not move the part already covered by the target grid point', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -2)];
    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.totalPlannedExportEnergyKwh).toBe(1.5);
  });

  it('uses multiple earlier timesteps when one timestep cannot absorb all energy', () => {
    const timeSeries = [
      timestep(0, 0.2, 0),
      timestep(15, 0.3, 0),
      timestep(30, -0.1, 5),
    ];
    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(3.73, 10);
    expect(result.remainingExportEnergyKwh).toBeCloseTo(1.27, 10);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-7.46, 10);
    expect(result.proposals[1].action.gridTargetPowerKw).toBeCloseTo(-7.46, 10);
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const original = structuredClone(timeSeries);
    new PrematureExportStrategy().createPlan(timeSeries);
    expect(timeSeries).toEqual(original);
  });

  it('supports configured export power, timestep duration and priority', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:30:00Z',
        values: { importPrice: 0.2, grid_export_kwh: 0 },
      },
      {
        start: '2026-01-01T00:30:00Z',
        end: '2026-01-01T01:00:00Z',
        values: { importPrice: -0.1, grid_export_kwh: 2 },
      },
    ];

    const result = new PrematureExportStrategy({
      maxExportPowerKw: 4,
      intervalMinutes: 30,
      priority: 80,
    }).createPlan(timeSeries);

    expect(result.proposals[0].priority).toBe(80);
    expect(result.proposals[0].action.gridTargetPowerKw).toBe(-4);
  });
});
