import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - influence of single extra load only', () => {
  describe('for partial current timestep, car is stopping in future timestep', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = -2.1 kW * (10/60)h = -0.35 kWh'
      ).toBeCloseTo(19.65, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at 0'
      ).toBeCloseTo(0, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
  describe('for partial current timestep, car is stopping in within timestep', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T12:13:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = -2.1 kW * (6/60)h = -0.28 kWh'
      ).toBeCloseTo(19.72, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T12:13:00.000Z') }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at 0'
      ).toBeCloseTo(0, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
  });

  describe('for full future timestep, car is stopping in an even later future timestep', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 4, end: new Date('2026-04-08T14:00:00.000Z') }], // covers full frame
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = -4 kW * 0.25 h = -1 kWh'
      ).toBeCloseTo(19, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 4, end: new Date('2026-04-08T14:00:00.000Z') }], // covers full frame
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at 0'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });

  describe('for full future timestep, car is stopping in an that exact future timestep', () => {
    it('batteryEnergyAtEndKwh changes', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 3, end: new Date('2026-04-08T13:05:00.000Z') }], // covers full frame
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected energy change = -3 kW * 5/60 h = -0.25 kWh'
      ).toBeCloseTo(19.75, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });
    it('batteryEnergyAtEndKwh cannot go below 0', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 0.2 },
        {
          extraLoads: [{ name: 'test', consumptionPowerKw: 3, end: new Date('2026-04-08T13:05:00.000Z') }], // covers full frame
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(
        nextState.batteryEnergyAtEndKwh,
        'batteryEnergyAtEndKwh capped at 0'
      ).toBeCloseTo(0, 6); // clamped to 0
      expectStandardNextStateAttributesPresent(nextState);
    });
  });
});
