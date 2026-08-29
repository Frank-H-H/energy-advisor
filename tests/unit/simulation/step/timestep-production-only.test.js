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

      const { nextState } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 6 kW * (10/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
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

      const { nextState } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
    });
    it('batteryEnergyAtEnd cannot exceed capacity (charge capped at capacity)', () => {
      const state = makeState('2026-04-08T12:05:00.000Z', {
        batteryEnergyAtStart: 42.8,
      });
      const components = makeComponents({
        capacity_kwh: 43,
        max_charge_kw: 8.7,
      });

      const { nextState } = simulateTimestep({ state, timestep, components });

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd cannot exceed capacity'
      ).toBeCloseTo(43, 6); // clamped to capacity
    });
  });
});
