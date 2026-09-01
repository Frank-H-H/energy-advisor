// tests/unit/step-full.test.js
import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - complex scenarios', () => {
  describe('solar, consumption, extra load and grid target', () => {
    it('for partial current frame', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          productionPowerKw: 6,
          consumptionPowerKw: 3,
          gridTargetPowerKw: 0.6,
          extraConsumptionPowerKw: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        }
      );
      const { nextState } = simulateTimestep(testFixture);

      // 20        # battery start
      // + 1       # production
      // - 0.5     # consumption
      // + 0.10    # target grid point of 10 minutes
      // - 0.35     # car loading of 10 minutes
      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 20 + 1 - 0.5 + 0.1 - 0.35 = '
      ).toBeCloseTo(20.25);
      expectStandardNextStateAttributesPresent(nextState);
    });

    it('for full future frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          productionPowerKw: 6,
          consumptionPowerKw: 3,
          gridTargetPowerKw: 0.6,
          extraConsumptionPowerKw: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        }
      );
      const { nextState } = simulateTimestep(testFixture);

      // 20        # battery start
      // + 1.5     # production
      // - 0.75    # consumption
      // + 0.15    # grid point
      // - 0.525     # extra consumption
      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = 20 + 1.5 - 0.75 + 0.15 - 0.525 = 20.375'
      ).toBeCloseTo(20.375);
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
