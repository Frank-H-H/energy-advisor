import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of production only', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          productionPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 6 kW * (10/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {
          batteryEnergyAtStartKwh: 42.8,
        },
        {
          productionPowerKw: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at capacity: 6 kW * (10/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
  describe('for full future frame', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          productionPowerKw: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 42.8 },
        {
          productionPowerKw: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
