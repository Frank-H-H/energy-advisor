// tests/unit/step-full.test.js
import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep takes additionalExport as action into account', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          prematureExportPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 6 kW * (10/60)h = -1 kWh'
      ).toBeCloseTo(19, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
  describe('for full future frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          prematureExportPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 6 kW * (15/60)h = 1.5 kWh'
      ).toBeCloseTo(18.5, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
