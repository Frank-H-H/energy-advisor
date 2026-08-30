import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of consumption only', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          expectedConsumptionPower: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 6 kW * (10/60)h = 1 kWh'
      ).toBeCloseTo(19);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0.2 },
        {
          expectedConsumptionPower: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at 0: 6 kW * (10/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
  describe('for full future frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          expectedConsumptionPower: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(19, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0.2 },
        {
          expectedConsumptionPower: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
