import { describe, expect, it } from 'vitest';
import {
  createTimeSeries,
  setGridPrices,
} from '../../src/simulation/time-series-builder.js';
import {
  extractTimeSeriesValues,
  findTimeSeriesValue,
} from '../../src/simulation/time-series-values.js';

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
    expect(result.every((timestep) => timestep.grid.targetPowerKw === 0)).toBe(
      true
    );
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
    expect(() =>
      createTimeSeries({ intervalMinutes: 30, horizonHours: 1 })
    ).toThrow('intervalMinutes must be 15 or 60');
    expect(() =>
      createTimeSeries({ intervalMinutes: 15, horizonHours: 0 })
    ).toThrow('horizonHours must be a positive number');
    expect(() =>
      createTimeSeries({ intervalMinutes: 15, horizonHours: 1.5 })
    ).toThrow('horizonHours must be a whole number');
  });
});

describe('setGridPrices', () => {
  it('sets fixed grid prices on every timestep', () => {
    const timeSeries = createTimeSeries({
      start: '2026-01-01T12:00:00Z',
      intervalMinutes: 15,
      horizonHours: 1,
    });

    const result = setGridPrices(timeSeries, {
      buyPerKwh: 0.32,
      sellPerKwh: 0.08,
      spotPerKwh: -0.02,
    });

    expect(result).toBe(timeSeries);
    expect(
      result.every(
        (timestep) =>
          timestep.grid.buyPerKwh === 0.32 &&
          timestep.grid.sellPerKwh === 0.08 &&
          timestep.grid.spotPerKwh === -0.02
      )
    ).toBe(true);
  });

  it('allows individual prices to remain unset', () => {
    const timeSeries = createTimeSeries({
      start: '2026-01-01T12:00:00Z',
      intervalMinutes: 15,
      horizonHours: 1,
    });

    setGridPrices(timeSeries, { buyPerKwh: 0.32 });

    expect(timeSeries[0].grid).toEqual({
      targetPowerKw: 0,
      buyPerKwh: 0.32,
      spotPerKwh: null,
      sellPerKwh: null,
    });
  });

  it('rejects non-finite prices', () => {
    const timeSeries = createTimeSeries({
      start: '2026-01-01T12:00:00Z',
      intervalMinutes: 15,
      horizonHours: 1,
    });

    expect(() =>
      setGridPrices(timeSeries, { buyPerKwh: 'not-a-number' })
    ).toThrow('buyPerKwh must be a finite number or null');
  });
});

describe('time-series value mapping', () => {
  it('maps an exact source interval', () => {
    const { entries } = extractTimeSeriesValues(
      {
        data: [
          {
            start: '2026-01-01T14:15:00Z',
            end: '2026-01-01T14:30:00Z',
            value: 0.12,
          },
        ],
      },
      {
        path: 'data',
        startField: 'start',
        endField: 'end',
        valueField: 'value',
      }
    );

    expect(
      findTimeSeriesValue(
        entries,
        '2026-01-01T14:15:00Z',
        '2026-01-01T14:30:00Z'
      )
    ).toBe(0.12);
  });

  it('uses a larger source interval when it contains the target', () => {
    const { entries } = extractTimeSeriesValues(
      {
        data: [
          {
            start: '2026-01-01T14:00:00Z',
            end: '2026-01-01T15:00:00Z',
            value: 0.15,
          },
        ],
      },
      {
        path: 'data',
        startField: 'start',
        endField: 'end',
        valueField: 'value',
      }
    );

    expect(
      findTimeSeriesValue(
        entries,
        '2026-01-01T14:15:00Z',
        '2026-01-01T14:30:00Z'
      )
    ).toBe(0.15);
  });

  it('averages smaller source intervals when they fully cover the target', () => {
    const { entries } = extractTimeSeriesValues(
      {
        data: [
          {
            start: '2026-01-01T14:00:00Z',
            end: '2026-01-01T14:15:00Z',
            value: 0.1,
          },
          {
            start: '2026-01-01T14:15:00Z',
            end: '2026-01-01T14:30:00Z',
            value: 0.2,
          },
          {
            start: '2026-01-01T14:30:00Z',
            end: '2026-01-01T14:45:00Z',
            value: 0.3,
          },
          {
            start: '2026-01-01T14:45:00Z',
            end: '2026-01-01T15:00:00Z',
            value: 0.4,
          },
        ],
      },
      {
        path: 'data',
        startField: 'start',
        endField: 'end',
        valueField: 'value',
      }
    );

    expect(
      findTimeSeriesValue(
        entries,
        '2026-01-01T14:00:00Z',
        '2026-01-01T15:00:00Z'
      )
    ).toBeCloseTo(0.25);
  });

  it('returns null when smaller source intervals do not fully cover the target', () => {
    const { entries } = extractTimeSeriesValues(
      {
        data: [
          {
            start: '2026-01-01T14:00:00Z',
            end: '2026-01-01T14:15:00Z',
            value: 0.1,
          },
          {
            start: '2026-01-01T14:15:00Z',
            end: '2026-01-01T14:30:00Z',
            value: 0.2,
          },
        ],
      },
      {
        path: 'data',
        startField: 'start',
        endField: 'end',
        valueField: 'value',
      }
    );

    expect(
      findTimeSeriesValue(
        entries,
        '2026-01-01T14:00:00Z',
        '2026-01-01T15:00:00Z'
      )
    ).toBeNull();
  });
});
