import { describe, expect, it } from 'vitest';
import { DistributedNegativePriceExportStrategy } from '../../src/advisor/strategies/distributedNegativePriceExportStrategy.js';

function timestep(startMinute, spotPerKwh, exportKwh, targetPowerKw = 0) {
  const start = new Date(
    `2026-01-01T00:${String(startMinute).padStart(2, '0')}:00Z`
  );
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    grid: { spotPerKwh, exportKwh, targetPowerKw },
  };
}

describe('DistributedNegativePriceExportStrategy', () => {
  it('distributes negative-price export across all earlier non-negative timesteps', () => {
    const timeSeries = [
      timestep(0, 0.1, 0),
      timestep(15, 0.2, 0),
      timestep(30, 0.3, 0),
      timestep(45, -0.1, 3),
    ];

    const result = new DistributedNegativePriceExportStrategy().createPlan(
      timeSeries
    );

    expect(result.strategyId).toBe('distributed-negative-price-export');
    expect(result.proposals).toHaveLength(3);
    expect(result.proposals.map((proposal) => proposal.action.gridTargetPowerKw)).toEqual([
      -4,
      -4,
      -4,
    ]);
    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(3, 10);
    expect(result.remainingExportEnergyKwh).toBeCloseTo(0, 10);
  });

  it('does not export during a negative-price timestep and only uses timesteps before the first negative price', () => {
    const timeSeries = [
      timestep(0, 0.1, 0),
      timestep(15, -0.1, 2),
      timestep(30, 0.4, 0),
    ];

    const result = new DistributedNegativePriceExportStrategy().createPlan(
      timeSeries
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].action.start.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-7.46, 10);
    expect(result.remainingExportEnergyKwh).toBeCloseTo(0.135, 10);
  });

  it('uses spot price rather than buy price to identify negative-price timesteps', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: {
          spotPerKwh: 0.2,
          buyPerKwh: 0.01,
          exportKwh: 0,
          targetPowerKw: 0,
        },
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T00:30:00Z',
        grid: {
          spotPerKwh: -0.1,
          buyPerKwh: 0.5,
          exportKwh: 2,
          targetPowerKw: -1,
        },
      },
    ];

    const result = new DistributedNegativePriceExportStrategy().createPlan(
      timeSeries
    );

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-7, 10);
  });

  it('uses the actual duration of each candidate timestep', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: { spotPerKwh: 0.1, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T01:15:00Z',
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
      },
      {
        start: '2026-01-01T01:15:00Z',
        end: '2026-01-01T01:30:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 3, targetPowerKw: 0 },
      },
    ];

    const result = new DistributedNegativePriceExportStrategy({
      maxExportPowerKw: 10,
    }).createPlan(timeSeries);

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].action.gridTargetPowerKw).toBeCloseTo(-6, 10);
    expect(result.proposals[1].action.gridTargetPowerKw).toBeCloseTo(-1.5, 10);
    expect(result.totalPlannedExportEnergyKwh).toBeCloseTo(3, 10);
    expect(result.remainingExportEnergyKwh).toBeCloseTo(0, 10);
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
      new DistributedNegativePriceExportStrategy().createPlan(timeSeries)
    ).toThrow('TimeSeries timestep must have a positive duration');
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [timestep(0, 0.2, 0), timestep(15, -0.1, 2)];
    const original = structuredClone(timeSeries);

    new DistributedNegativePriceExportStrategy().createPlan(timeSeries);

    expect(timeSeries).toEqual(original);
  });
});
