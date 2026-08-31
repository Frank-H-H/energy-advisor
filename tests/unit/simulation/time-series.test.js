import { describe, expect, it } from 'vitest';
import { simulateTimeSeries } from '../../../src/simulation/time-series.js';

describe('simulateTimeSeries', () => {
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

  it('simulates timesteps in order and passes the battery state to the next timestep', () => {
    const timesteps = [
      {
        start: new Date('2026-01-01T00:00:00Z'),
        end: new Date('2026-01-01T01:00:00Z'),
        expectedProductionPowerKw: 4,
        expectedConsumptionPowerKw: 0,
        gridTargetPowerKw: 0,
      },
      {
        start: new Date('2026-01-01T01:00:00Z'),
        end: new Date('2026-01-01T02:00:00Z'),
        expectedProductionPowerKw: 4,
        expectedConsumptionPowerKw: 0,
        gridTargetPowerKw: 0,
      },
    ];

    const result = simulateTimeSeries({
      state: {
        batteryEnergyAtStartKwh: 0,
      },
      timesteps,
      components,
    });

    expect(result.timesteps).toHaveLength(2);
    expect(result.timesteps[0].batteryEnergyAtEndKwh).toBe(4);
    expect(result.timesteps[1].batteryEnergyAtStartKwh).toBe(4);
    expect(result.timesteps[1].batteryEnergyAtEndKwh).toBe(8);
    expect(result.nextState.batteryEnergyAtStartKwh).toBe(8);
  });

  it('preserves the input state apart from the propagated battery state', () => {
    const state = {
      batteryEnergyAtStartKwh: 2,
      time: new Date('2026-01-01T00:00:00Z'),
      customValue: 'keep me',
    };

    const result = simulateTimeSeries({
      state,
      timesteps: [
        {
          start: new Date('2026-01-01T00:00:00Z'),
          end: new Date('2026-01-01T01:00:00Z'),
          expectedProductionPowerKw: 0,
          expectedConsumptionPowerKw: 1,
          gridTargetPowerKw: 0,
        },
      ],
      components,
    });

    expect(state.batteryEnergyAtStartKwh).toBe(2);
    expect(result.nextState.customValue).toBe('keep me');
    expect(result.nextState.time).toEqual(state.time);
    expect(result.nextState.batteryEnergyAtStartKwh).toBe(1);
  });

  it('returns the initial battery state when there are no timesteps', () => {
    const state = {
      batteryEnergyAtStartKwh: 3,
      customValue: 'unchanged',
    };

    const result = simulateTimeSeries({
      state,
      timesteps: [],
      components,
    });

    expect(result.timesteps).toEqual([]);
    expect(result.nextState).toEqual(state);
  });

  it('uses the given order instead of sorting timesteps', () => {
    const first = {
      start: new Date('2026-01-01T01:00:00Z'),
      end: new Date('2026-01-01T02:00:00Z'),
      expectedProductionPowerKw: 2,
      expectedConsumptionPowerKw: 0,
      gridTargetPowerKw: 0,
    };
    const second = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-01T01:00:00Z'),
      expectedProductionPowerKw: 3,
      expectedConsumptionPowerKw: 0,
      gridTargetPowerKw: 0,
    };

    const result = simulateTimeSeries({
      state: { batteryEnergyAtStartKwh: 0 },
      timesteps: [first, second],
      components,
    });

    expect(result.timesteps[0].batteryEnergyAtEndKwh).toBe(2);
    expect(result.timesteps[1].batteryEnergyAtStartKwh).toBe(2);
    expect(result.timesteps[1].batteryEnergyAtEndKwh).toBe(5);
  });
});
