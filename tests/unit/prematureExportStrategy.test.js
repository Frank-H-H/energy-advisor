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
    durationMs: 15 * 60 * 1000,
    values: {
      importPrice,
      grid_export_kwh: exportedEnergyKwh,
      gridTargetPowerKw,
    },
  };
}

describe('PrematureExportStrategy', () => {
  it('creates an export action for excess export in a negative-price timestep', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];

    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.strategyId).toBe('premature-export');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].action).toMatchObject({
      component: 'grid',
      type: 'export-energy',
      energyKwh: 1.75,
      powerKw: 7.46,
      reason: 'AVOID_NEGATIVE_EXPORT_PRICE',
      resource: 'grid-export',
    });
    expect(result.remainingExportEnergyKwh).toBe(0);
    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(1.75, 10);
  });

  it('does not move the part already covered by the target grid point', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -2)];

    const result = new PrematureExportStrategy().createPlan(timeSeries);

    expect(result.totalPlannedExportEnergyKwh).toBe(1.5);
    expect(result.proposals[0].action.energyKwh).toBe(1.5);
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
    expect(result.proposals[0].action.energyKwh).toBeCloseTo(1.865, 10);
    expect(result.proposals[1].action.energyKwh).toBeCloseTo(1.865, 10);
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2, -1)];
    const original = structuredClone(timeSeries);

    new PrematureExportStrategy().createPlan(timeSeries);

    expect(timeSeries).toEqual(original);
  });

  it('supports configured export power and timestep duration', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(30, -0.1, 2)];

    const result = new PrematureExportStrategy({
      maxExportPowerKw: 4,
      intervalMinutes: 30,
    }).createPlan(timeSeries);

    expect(result.proposals[0].action.powerKw).toBe(4);
    expect(result.proposals[0].action.energyKwh).toBe(2);
  });
});
