import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of gridTarget only', () => {
  describe('for partial current frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          gridTarget: 0.6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 0.6 kW * (10/60)h = 0.1 kWh'
      ).toBeCloseTo(20.1, 6);
    });
    it('batteryEnergyAtEnd cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {
          batteryEnergyAtStart: 42.8,
        },
        {
          gridTarget: 6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (10/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStart: 0.2 },
        {
          gridTarget: -6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at 0: 6 kW * (10/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
    });
  });

  describe('for full future frame', () => {
    it('batteryEnergyAtEnd changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          gridTarget: 0.4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'expected energy change = 0.4 kW * (15/60)h = 1 kWh'
      ).toBeCloseTo(20.1, 6);
    });
    it('batteryEnergyAtEnd cannot exceed capacity (charge capped at capacity)', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 42.8 },
        {
          gridTarget: 4,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than missing 0.2)'
      ).toBeCloseTo(43, 6); // clamped to capacity
    });
    it('batteryEnergyAtEnd cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStart: 0.2 },
        {
          gridTarget: -6,
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEnd,
        'batteryEnergyAtEnd capped at capacity: 6 kW * (15/60)h = 1 kWh (larger than remaining 0.2)'
      ).toBeCloseTo(0, 6); // clamped to 0
    });
  });
});
