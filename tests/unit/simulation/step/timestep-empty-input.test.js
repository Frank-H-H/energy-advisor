import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - no data at all', () => {
  describe('for partial current frame', () => {
    it('no change in batteryEnergyAtEnd', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {}
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(20, 6);
    });
  });
  describe('for full future frame', () => {
    it('no change in batteryEnergyAtEnd', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture({}, {});

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.batteryEnergyAtEnd).toBeCloseTo(20, 6);
    });
  });
});
