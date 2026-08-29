import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of production only', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          expectedProductionPower: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 6 kW * (10/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
    });
    it('batteryEnergyAtEnd cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {
          batteryEnergyAtStart: 42.8,
        },
        {
          expectedProductionPower: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (10/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
    });
  });
  describe('for full future frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          expectedProductionPower: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(21, 6);
    });
    it('batteryEnergyAtEnd cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 42.8 },
        {
          expectedProductionPower: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
    });
  });
});
