import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  makeTimestep,
  makeState,
  makeComponents,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of consumption only', () => {
  describe('for partial current frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T12:00:00.000Z',
      '2026-04-08T12:15:00.000Z',
      {
        expectedConsumptionPower: 6, // kW
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
      ).toBeCloseTo(19);
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const state = makeState('2026-04-08T12:05:00.000Z', {
        batteryEnergyAtStart: 0.2,
      });
      const components = makeComponents({});

      const { nextState } = simulateTimestep({ state, timestep, components });

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at 0: 6 kW * (10/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
    });
  });
  describe('for full future frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T13:00:00.000Z',
      '2026-04-08T13:15:00.000Z',
      {
        expectedConsumptionPower: 4, // kW
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
      ).toBeCloseTo(19, 6);
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const state = makeState('2026-04-08T12:05:00.000Z', {
        batteryEnergyAtStart: 0.2,
      });
      const components = makeComponents({});

      const { nextState } = simulateTimestep({ state, timestep, components });

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
    });
  });
});
