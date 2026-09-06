import { describe, expect, it } from 'vitest';
import { createTimeSeries } from '../../src/simulation/time-series-builder.js';

describe('createTimeSeries', () => {
  it('creates a 15-minute series aligned to the interval', () => {
    const result = createTimeSeries({
      start: '2026-01-01T12:07:30Z',
      intervalMinutes: 15,
      horizonHours: 1,
    });

    expect(result).toHaveLength(4);
    expect(result[0].start).toBe('2026-01-01T12:00:00.000Z');
    expect(result[0].end).toBe('2026-01-01T12:15:00.000Z');
    expect(result[3].end).toBe('2026-01-01T13:00:00.000Z');
    expect(result.every((timestep) => timestep.grid.targetPowerKw === 0)).toBe(true);
  });

  it('creates hourly timesteps', () => {
    const result = createTimeSeries({
      start: '2026-01-01T12:37:00Z',
      intervalMinutes: 60,
      horizonHours: 3,
    });

    expect(result).toHaveLength(3);
    expect(result.map((timestep) => timestep.start)).toEqual([
      '2026-01-01T12:00:00.000Z',
      '2026-01-01T13:00:00.000Z',
      '2026-01-01T14:00:00.000Z',
    ]);
  });

  it('rejects unsupported intervals and invalid horizons', () => {
    expect(() => createTimeSeries({ intervalMinutes: 30, horizonHours: 1 })).toThrow(
      'intervalMinutes must be 15 or 60'
    );
    expect(() => createTimeSeries({ intervalMinutes: 15, horizonHours: 0 })).toThrow(
      'horizonHours must be a positive number'
    );
    expect(() => createTimeSeries({ intervalMinutes: 15, horizonHours: 1.5 })).toThrow(
      'horizonHours must be a whole number'
    );
  });
});
