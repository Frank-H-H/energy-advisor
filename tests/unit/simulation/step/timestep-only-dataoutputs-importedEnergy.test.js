import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - computation of importedEnergy', () => {
  describe('for partial current frame', () => {
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0 },
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.importedEnergy,
        'imported: 2.1 kW * (10/60)h = 0.35 kWh'
      ).toBeCloseTo(0.35, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0.14 },
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // battery empty after 4 minutes
      expect(
        nextState.importedEnergy,
        'imported: 2.1 kW * (6/60)h = 0.21 kWh'
      ).toBeCloseTo(0.21, 6);
    });
    it('when battery is not empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.importedEnergy).toBeCloseTo(0, 6);
    });
  });
  describe('for full future frame', () => {
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0 },
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.importedEnergy,
        'imported: 2.1 kW * (15/60)h = 0.525 kWh'
      ).toBeCloseTo(0.525, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0.14 },
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // battery empty after 4 minutes
      expect(
        nextState.importedEnergy,
        'imported: 2.1 kW * (11/60)h = 0.385 kWh'
      ).toBeCloseTo(0.385, 6);
    });
    it('when battery is not empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          expectedConsumptionPower: 2.1,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.importedEnergy).toBeCloseTo(0, 6);
    });
  });
});
