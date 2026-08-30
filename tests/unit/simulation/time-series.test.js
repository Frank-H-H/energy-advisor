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
        expectedProductionPower: 4,
        expectedConsumptionPower: 0,
        gridTarget: 0,
      },
      {
        start: new Date('2026-01-01T01:00:00Z'),
        end: new Date('2026-01-01T02:00:00Z'),
        expectedProductionPower: 4,
        expectedConsumptionPower: 0,
        gridTarget: 0,
      },
    ];

    const result = simulateTimeSeries({
      state: {
        batteryEnergyAtStart: 0,
      },
      timesteps,
      components,
    });

    expect(result.timesteps).toHaveLength(2);
    expect(result.timesteps[0].batteryEnergyAtEnd).toBe(4);
    expect(result.timesteps[1].batteryEnergyAtStart).toBe(4);
    expect(result.timesteps[1].batteryEnergyAtEnd).toBe(8);
    expect(result.nextState.batteryEnergyAtStart).toBe(8);
  });

  it('preserves the input state apart from the propagated battery state', () => {
    const state = {
      batteryEnergyAtStart: 2,
      time: new Date('2026-01-01T00:00:00Z'),
      customValue: 'keep me',
    };

    const result = simulateTimeSeries({
      state,
      timesteps: [
        {
          start: new Date('2026-01-01T00:00:00Z'),
          end: new Date('2026-01-01T01:00:00Z'),
          expectedProductionPower: 0,
          expectedConsumptionPower: 1,
          gridTarget: 0,
        },
      ],
      components,
    });

    expect(state.batteryEnergyAtStart).toBe(2);
    expect(result.nextState.customValue).toBe('keep me');
    expect(result.nextState.time).toEqual(state.time);
    expect(result.nextState.batteryEnergyAtStart).toBe(1);
  });

  it('returns the initial battery state when there are no timesteps', () => {
    const state = {
      batteryEnergyAtStart: 3,
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
      expectedProductionPower: 2,
      expectedConsumptionPower: 0,
      gridTarget: 0,
    };
    const second = {
      start: new Date('2026-01-01T00:00:00Z'),
      end: new Date('2026-01-01T01:00:00Z'),
      expectedProductionPower: 3,
      expectedConsumptionPower: 0,
      gridTarget: 0,
    };

    const result = simulateTimeSeries({
      state: { batteryEnergyAtStart: 0 },
      timesteps: [first, second],
      components,
    });

    expect(result.timesteps[0].batteryEnergyAtEnd).toBe(2);
    expect(result.timesteps[1].batteryEnergyAtStart).toBe(2);
    expect(result.timesteps[1].batteryEnergyAtEnd).toBe(5);
  });
});
