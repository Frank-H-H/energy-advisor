import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import { makeTimestep, makeComponents } from '../../../helpers/simulation.js';

describe('simulateTimestep - no data at all', () => {
  describe('for partial current frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T12:05:00.000Z',
      '2026-04-08T12:15:00.000Z'
    );
    it('no change in batteryEnergyAtEnd', () => {
      const state = { batteryEnergyAtStart: 20 };
      const components = makeComponents({});

      const { nextState, outputs, diagnostics } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(20, 6);
    });
  });
  describe('for full future frame', () => {
    const timestep = makeTimestep(
      '2026-04-08T13:00:00.000Z',
      '2026-04-08T13:15:00.000Z'
    );
    it('no change in batteryEnergyAtEnd', () => {
      const state = { batteryEnergyAtStart: 20 };
      const components = makeComponents({});

      const { nextState, outputs, diagnostics } = simulateTimestep({
        state,
        timestep,
        components,
      });

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(20, 6);
    });
  });
});
