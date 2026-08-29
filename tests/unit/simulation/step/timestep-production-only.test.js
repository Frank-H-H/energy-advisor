import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  makeTimestep,
  makeState,
  makeComponents,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of production only', () => {
  describe('for partial current frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T12:00:00.000Z',
      '2026-04-08T12:15:00.000Z',
      {
        expectedProductionPower: 6, // kW
      }
    );
    it('batteryEnergyAtEnd changes', () => {
      const state = makeState('2026-04-08T12:05:00.000Z', {
        batteryEnergyAtStart: 20,
      });
      const components = makeComponents({});

      const { nextState, outputs, diagnostics } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(21, 6);
    });
  });
  describe('for full future frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T13:00:00.000Z',
      '2026-04-08T13:15:00.000Z',
      {
        expectedProductionPower: 4, // kW
      }
    );
    it('batteryEnergyAtEnd changes', () => {
      const state = makeState('2026-04-08T12:05:00.000Z', {
        batteryEnergyAtStart: 20,
      });
      const components = makeComponents({});

      const { nextState, outputs, diagnostics } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(21, 6);
    });
  });
  /*  xit('current frame: charging from production (partial 10min) increases SOC by 1 kWh', () => {
    const interval = makeInterval('2026-04-08T12:05:00.000Z', '2026-04-08T12:15:00.000Z', {
      expectedProductionPower: 6 // kW
    })
    const state = { battery_soc_kwh: 20 } // batteryChargeAtStart
    const components = makeComponents({ max_charge_kw: 8 })

    const { nextState } = simulateTimestep({ state, interval, components })

    // expected energy change = 6 kW * (10/60)h = 1 kWh
    expect(nextState.battery_soc_kwh).toBeCloseTo(21, 6)
  })

  xit('future frame: battery state cannot exceed capacity (charge capped at capacity)', () => {
    const interval = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      expectedProductionPower: 9 // kW produced
    })
    const state = { battery_soc_kwh: 42.8 }
    const components = makeComponents({ capacity_kwh: 43, max_charge_kw: 8.7 })

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(43, 6) // clamped to capacity
  })

  xit('future frame: production increases SOC (4 kW => +1 kWh in 15min)', () => {
    const interval = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      expectedProductionPower: 4
    })
    const state = { battery_soc_kwh: 20 }
    const components = makeComponents({ max_charge_kw: 8.7 })

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(21, 6)
  })*/
});
