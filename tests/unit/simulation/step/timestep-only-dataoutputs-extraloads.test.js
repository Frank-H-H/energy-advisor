import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - computation of extraConsumedEnergyKwh', () => {
  describe('for partial current frame', () => {
    it('ends before frame -> 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T12:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends after frame', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 2.1 kW * (10/60)h = 0.35 kWh'
      ).toBeCloseTo(0.35, 6);
    });
    it('ends in already passed frame part', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T12:04:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends in yet to pass frame part', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T12:11:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 2.1 kW * (6/60)h = 0.21 kWh'
      ).toBeCloseTo(0.21, 6);
    });
    it('zero consumption power yields 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 0, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 0 kW * (10/60)h = 0.35 kWh'
      ).toBeCloseTo(0, 6);
    });
  });
  describe('for full future frame', () => {
    it('ends before frame -> 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T13:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: already stopped'
      ).toBeCloseTo(0, 6);
    });
    it('ends after frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 2.1 kW * (15/60)h = 0.525 kWh'
      ).toBeCloseTo(0.525, 6);
    });
    it('ends in frame', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T13:06:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 2.1 kW * (6/60)h = 0.21 kWh'
      ).toBeCloseTo(0.21, 6);
    });
    it('zero consumption power yields 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 0, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.extraConsumedEnergyKwh,
        'extraLoad: 0 kW * (15/60)h = 0.525 kWh'
      ).toBeCloseTo(0.0, 6);
    });
  });
  it('starts inside the timestep without an end', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        extraLoads: [
          {
            name: 'car',
            consumptionPowerKw: 2.1,
            start: new Date('2026-04-08T13:06:00.000Z'),
          },
        ],
      }
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.extraConsumedEnergyKwh).toBeCloseTo(
      2.1 * (9 / 60),
      6
    );
  });

  it('starts and ends inside the timestep', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        extraLoads: [
          {
            name: 'car',
            consumptionPowerKw: 2.1,
            start: new Date('2026-04-08T13:06:00.000Z'),
            end: new Date('2026-04-08T13:11:00.000Z'),
          },
        ],
      }
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.extraConsumedEnergyKwh).toBeCloseTo(
      2.1 * (5 / 60),
      6
    );
  });


});
