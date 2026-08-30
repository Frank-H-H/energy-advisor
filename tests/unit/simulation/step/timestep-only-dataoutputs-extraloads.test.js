import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - computation of extraConsumedEnergy', () => {
  describe('for partial current frame', () => {
    it('ends before frame', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T12:00:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends after frame', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: 2.1 kW * (10/60)h = 0.35 kWh'
      ).toBeCloseTo(0.35, 6);
    });
    it('ends in already passed frame part', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T12:04:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends in yet to pass frame part', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T12:11:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: 2.1 kW * (6/60)h = 0.21 kWh'
      ).toBeCloseTo(0.21, 6);
    });
  });
  describe('for full future frame', () => {
    it('ends before frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T13:00:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends after frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: 2.1 kW * (15/60)h = 0.525 kWh'
      ).toBeCloseTo(0.525, 6);
    });
    it('ends in frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraConsumptionPower: 2.1,
          extraConsumptionEndsAt: new Date('2026-04-08T13:06:00.000Z'),
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergy,
        'extraLoad: 2.1 kW * (6/60)h = 0.21 kWh'
      ).toBeCloseTo(0.21, 6);
    });
  });
});
