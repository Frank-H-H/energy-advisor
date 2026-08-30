import { describe, expect, it } from 'vitest';
import { ForecastEngine } from '../../../src/simulation/forecastEngine.js';

describe('ForecastEngine', () => {
  const components = {
    battery: {
      capacity_kwh: 10,
      soc_kwh: 0,
      max_charge_power_kw: 10,
      max_discharge_power_kw: 10,
    },
    grid: {
      max_export_power_kw: 10,
    },
  };

  it('uses time-series simulation for consecutive forecast intervals', () => {
    const result = ForecastEngine.run({
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          values: {
            consumption_kwh: 0,
            pv_kwh: 4,
          },
        },
        {
          start: '2026-01-01T01:00:00Z',
          end: '2026-01-01T02:00:00Z',
          values: {
            consumption_kwh: 0,
            pv_kwh: 4,
          },
        },
      ],
      components,
    });

    expect(result).toHaveLength(2);

    expect(result[0].values.battery_soc_kwh).toBe(4);

    expect(result[1].values.battery_soc_kwh).toBe(8);
  });

  it('converts interval energy to timestep power', () => {
    const result = ForecastEngine.run({
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          values: {
            consumption_kwh: 0,
            pv_kwh: 1,
          },
        },
      ],
      components,
    });

    expect(result[0].values.battery_soc_kwh).toBe(1);
  });

  it('calculates cost from simulated grid import', () => {
    const result = ForecastEngine.run({
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          values: {
            consumption_kwh: 3,
            pv_kwh: 0,
            importPrice: 0.3,
            exportPrice: 0.1,
          },
        },
      ],
      components: {
        battery: {
          capacity_kwh: 1,
          soc_kwh: 0,
          max_charge_power_kw: 10,
          max_discharge_power_kw: 10,
        },
        grid: {
          max_export_power_kw: 10,
        },
      },
    });

    expect(result[0].values.grid_import_kwh).toBe(3);

    expect(result[0].values.cost).toBeCloseTo(0.9);

    expect(result[0].values.revenue).toBe(0);
  });

  it('rejects intervals without a positive duration', () => {
    expect(() =>
      ForecastEngine.run({
        intervals: [
          {
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T00:00:00Z',
            values: {},
          },
        ],
        components,
      })
    ).toThrow('forecast interval must have a positive duration');
  });
});
