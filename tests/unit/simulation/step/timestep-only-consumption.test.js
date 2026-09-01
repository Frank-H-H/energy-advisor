import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of consumption only', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          consumptionPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 6 kW * (10/60)h = 1 kWh'
      ).toBeCloseTo(19);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          consumptionPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at 0: 6 kW * (10/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
  describe('for full future frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          consumptionPowerKw: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(19, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          consumptionPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
