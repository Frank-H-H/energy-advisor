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
          solar: { productionPowerKw: 4 },
          load: { consumptionPowerKw: 0 },
        },
        {
          start: '2026-01-01T01:00:00Z',
          end: '2026-01-01T02:00:00Z',
          solar: { productionPowerKw: 4 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result).toHaveLength(2);
    expect(result[0].battery.energyKwh).toBe(4);
    expect(result[1].battery.energyKwh).toBe(8);
  });

  it('uses the battery energy from the input state as the initial simulation state', () => {
    const result = ForecastEngine.run({
      state: { batteryEnergyKwh: 6 },
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result[0].battery.energyKwh).toBe(7);
  });

  it('uses interval power directly', () => {
    const result = ForecastEngine.run({
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result[0].solar.productionPowerKw).toBe(1);
    expect(result[0].battery.energyKwh).toBe(0.25);
  });

  it('returns a domain-grouped TimeSeries that can be consumed by the advisor', () => {
    const result = ForecastEngine.run({
      state: { batteryEnergyKwh: 2 },
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 4 },
          load: { consumptionPowerKw: 1 },
          grid: { targetPowerKw: 0, buyPerKwh: 0.3, sellPerKwh: 0.1 },
        },
      ],
      components,
    });

    expect(result[0]).toMatchObject({
      solar: { productionPowerKw: 4, missedProductionKwh: 0 },
      load: { consumptionPowerKw: 1, extraConsumptionKwh: 0 },
      battery: { energyKwh: 5, chargeKwh: 3, dischargeKwh: 0 },
      grid: {
        targetPowerKw: 0,
        importKwh: 0,
        exportKwh: 0,
        buyPerKwh: 0.3,
        sellPerKwh: 0.1,
      },
      economics: { cost: 0, revenue: 0 },
    });
    expect(result[0]).not.toHaveProperty('values');
  });

  it('calculates cost from simulated grid import', () => {
    const result = ForecastEngine.run({
      intervals: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 0 },
          load: { consumptionPowerKw: 3 },
          grid: { buyPerKwh: 0.3, sellPerKwh: 0.1 },
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

    expect(result[0].grid.importKwh).toBe(3);
    expect(result[0].economics.cost).toBeCloseTo(0.9);
    expect(result[0].economics.revenue).toBe(0);
  });

  it('rejects intervals without a positive duration', () => {
    expect(() =>
      ForecastEngine.run({
        intervals: [
          {
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T00:00:00Z',
            solar: {},
            load: {},
          },
        ],
        components,
      })
    ).toThrow('forecast interval must have a positive duration');
  });
});
