import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - computation of missedProduction', () => {
  describe('for partial current frame', () => {
    it('when battery is full', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 43 },
        {
          expectedProductionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // grid feed in is limited to 7 kW
      // so we have exactly 10 minutes of 3 kW missed production
      expect(
        nextState.missedProduction,
        'missed: 3 kW * (10/60)h = 0.5 kWh'
      ).toBeCloseTo(0.5, 6);
    });
    it('when battery gets full', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 42.6 },
        {
          expectedProductionPower: 18,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 8 of the 18 kW production power goes into battery for 3 minutes
      // to top up that missing 0.4 kWh
      // the remaining 10 kW is above the limited grid feed in of 7kW
      // so we have 3 minutes * 3 kW = 0.15
      // after that, grid feed in is limited to 7 kW
      // so we have 7 minutes * 11 kW = 1.2833333 kW
      expect(
        nextState.missedProduction,
        'missed: 3 kW * (3/60)h + 11 kW * (7/60)h = 1.4333333 kWh'
      ).toBeCloseTo(1.4333333, 6);
    });
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0 },
        {
          expectedConsumptionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.missedProduction).toBeCloseTo(0, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0.4 },
        {
          expectedConsumptionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.missedProduction).toBeCloseTo(0, 6);
    });
  });
  describe('for full future frame', () => {
    it('when battery is full', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 43 },
        {
          expectedProductionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // grid feed in is limited to 7 kW
      // so we have exactly 15 minutes of 3 kW missed production
      expect(
        nextState.missedProduction,
        'missed: 3 kW * (15/60)h = 0.75 kWh'
      ).toBeCloseTo(0.75, 6);
    });
    it('when battery gets full', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 42.6 },
        {
          expectedProductionPower: 18,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 8 of the 18 kW production power goes into battery for 3 minutes
      // to top up that missing 0.4 kWh
      // the remaining 10 kW is above the limited grid feed in of 7kW
      // so we have 3 minutes * 3 kW = 0.15
      // after that, grid feed in is limited to 7 kW
      // so we have 12 minutes * 11 kW = 2.2 kW
      expect(
        nextState.missedProduction,
        'missed: 3 kW * (3/60)h + 11 kW * (12/60)h = 2.35 kWh'
      ).toBeCloseTo(2.35, 6);
    });
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0 },
        {
          expectedConsumptionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.missedProduction).toBeCloseTo(0, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0.4 },
        {
          expectedConsumptionPower: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.missedProduction).toBeCloseTo(0, 6);
    });
  });
});
