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

  it('uses time-series simulation for consecutive forecast timesteps', () => {
    const result = ForecastEngine.run({
      timeSeries: [
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

    expect(result.timeSeries).toHaveLength(2);
    expect(result.timeSeries[0].battery.energyKwh).toBe(4);
    expect(result.timeSeries[1].battery.energyKwh).toBe(8);
  });

  it('includes battery state of charge percentage for each forecast timestep', () => {
    const result = ForecastEngine.run({
      initialState: { batteryEnergyKwh: 2 },
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 3 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result.timeSeries[0].battery.stateOfChargePercent).toBe(50);
  });

  it('preserves the input initialState in the forecast result for re-simulation', () => {
    const initialState = { batteryEnergyKwh: 6 };
    const result = ForecastEngine.run({
      initialState,
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result.initialState).toBe(initialState);
    expect(result.initialState).toEqual({ batteryEnergyKwh: 6 });
  });

  it('uses the battery energy from the input state as the initial simulation state', () => {
    const result = ForecastEngine.run({
      initialState: { batteryEnergyKwh: 6 },
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result.timeSeries[0].battery.energyKwh).toBe(7);
  });

  it('does not use the configured battery SOC as the initial state fallback', () => {
    const result = ForecastEngine.run({
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result.timeSeries[0].battery.energyKwh).toBe(1);
  });

  it('uses interval power directly', () => {
    const result = ForecastEngine.run({
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          solar: { productionPowerKw: 1 },
          load: { consumptionPowerKw: 0 },
        },
      ],
      components,
    });

    expect(result.timeSeries[0].solar.productionPowerKw).toBe(1);
    expect(result.timeSeries[0].battery.energyKwh).toBe(0.25);
  });

  it('applies set-grid-target actions from a Plan before simulation', () => {
    const result = ForecastEngine.run({
      initialState: { batteryEnergyKwh: 10 },
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 0 },
          load: { consumptionPowerKw: 0 },
          grid: { targetPowerKw: 0, sellPerKwh: 0.1 },
        },
      ],
      plan: {
        actions: [
          {
            type: 'set-grid-target',
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T01:00:00Z',
            gridTargetPowerKw: -5,
          },
        ],
      },
      components,
    });

    expect(result.timeSeries[0].grid.targetPowerKw).toBe(-5);
    expect(result.timeSeries[0].grid.exportKwh).toBe(5);
    expect(result.timeSeries[0].battery.energyKwh).toBe(5);
  });

  it('rejects plan actions that do not match a forecast timestep', () => {
    expect(() =>
      ForecastEngine.run({
        timeSeries: [
          {
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T01:00:00Z',
            solar: {},
            load: {},
          },
        ],
        plan: {
          actions: [
            {
              type: 'set-grid-target',
              start: '2026-01-01T00:15:00Z',
              end: '2026-01-01T00:30:00Z',
              gridTargetPowerKw: -5,
            },
          ],
        },
        components,
      })
    ).toThrow('does not match a forecast timestep');
  });

  it('returns a domain-grouped TimeSeries that can be consumed by the advisor', () => {
    const result = ForecastEngine.run({
      initialState: { batteryEnergyKwh: 2 },
      timeSeries: [
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

    expect(result.timeSeries[0]).toMatchObject({
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
    expect(result.timeSeries[0]).not.toHaveProperty('values');
  });

  it('calculates cost from simulated grid import', () => {
    const result = ForecastEngine.run({
      timeSeries: [
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

    expect(result.timeSeries[0].grid.importKwh).toBe(3);
    expect(result.timeSeries[0].economics.cost).toBeCloseTo(0.9);
    expect(result.timeSeries[0].economics.revenue).toBe(0);
  });

  it('generates an aggregated summary for the simulated time series', () => {
    const result = ForecastEngine.run({
      initialState: { batteryEnergyKwh: 0 },
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          solar: { productionPowerKw: 4 },
          load: { consumptionPowerKw: 5 },
          grid: { buyPerKwh: 0.3, sellPerKwh: 0.1 },
        },
        {
          start: '2026-01-01T01:00:00Z',
          end: '2026-01-01T02:00:00Z',
          solar: { productionPowerKw: 2 },
          load: { consumptionPowerKw: 0 },
          grid: { buyPerKwh: 0.2, sellPerKwh: 0.1 },
        },
      ],
      components: {
        battery: {
          capacity_kwh: 10,
          soc_kwh: 0,
          max_charge_power_kw: 10,
          max_discharge_power_kw: 10,
        },
        grid: { max_export_power_kw: 10 },
      },
    });

    expect(result.summary).toEqual({
      economics: { cost: 0.3, revenue: 0, netCost: 0.3 },
      grid: { importKwh: 1, exportKwh: 0 },
      solar: { productionKwh: 6, missedProductionKwh: 0 },
      battery: { startEnergyKwh: 0, endEnergyKwh: 2 },
    });
  });

  it('rejects timesteps without a positive duration', () => {
    expect(() =>
      ForecastEngine.run({
        timeSeries: [
          {
            start: '2026-01-01T00:00:00Z',
            end: '2026-01-01T00:00:00Z',
            solar: {},
            load: {},
          },
        ],
        components,
      })
    ).toThrow('forecast timestep must have a positive duration');
  });
});
