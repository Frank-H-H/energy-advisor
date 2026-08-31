import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - computation of exportedEnergyKwh', () => {
  describe('for partial current frame', () => {
    it('when battery is full', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 43 },
        {
          expectedProductionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // grid feed in is limited to 7 kW
      // so we have exactly 10 minutes of 7 kW export
      expect(
        nextState.exportedEnergyKwh,
        'exported: 7 kW * (10/60)h = 1.16 kWh'
      ).toBeCloseTo(1.1666666, 6);
    });
    it('when battery gets full', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 42.6 },
        {
          expectedProductionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 8 of the 10 kW production power goes into battery for 3 minutes to top up that missing 0.4 kWh
      // so we have 3 minutes * 2 kW = 0.1
      // after that, grid feed in is limited to 7 kW
      // so we have exactly 7 minutes of 7 kW export: 0.7
      expect(
        nextState.exportedEnergyKwh,
        'exported: 2 kW * (3/60)h + 7 kW * (7/60)h = 0.916666 kWh'
      ).toBeCloseTo(0.9166666, 6);
    });
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 0 },
        {
          expectedConsumptionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 0.4 },
        {
          expectedConsumptionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
    });
  });
  describe('for full future frame', () => {
    it('when battery is full', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 43 },
        {
          expectedProductionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // grid feed in is limited to 7 kW
      // so we have exactly 15 minutes of 7 kW export
      expect(
        nextState.exportedEnergyKwh,
        'exported: 7 kW * (15/60)h = 1.75 kWh'
      ).toBeCloseTo(1.75, 6);
    });
    it('when battery gets full', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 42.6 },
        {
          expectedProductionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 8 of the 10 kW production power goes into battery for 3 minutes
      // to top up that missing 0.4 kWh
      // so we have 3 minutes * 2 kW = 0.1
      // after that, grid feed in is limited to 7 kW
      // so we have exactly 12 minutes of 7 kW export
      expect(
        nextState.exportedEnergyKwh,
        'exported: 2 kW * (3/60)h + 7 kW * (6/60)h = 1.5 kWh'
      ).toBeCloseTo(1.5, 6);
    });
    it('when battery is empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 0 },
        {
          expectedConsumptionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
    });
    it('when battery gets empty', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 0.4 },
        {
          expectedConsumptionPowerKw: 10,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
    });
  });
});
