import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - constant idle losses', () => {
  it('reduces a production surplus by the idle losses', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        productionPowerKw: 4,
      },
      { idle_losses_kw: 0.2 }
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(
      nextState.batteryEnergyAtEndKwh,
      'effective charging power = 4 kW - 0.2 kW idle losses = 3.8 kW * (15/60)h = 0.95 kWh'
    ).toBeCloseTo(20.95, 6);
    expectStandardNextStateAttributesPresent(nextState);
  });

  it('discharges the battery when only idle losses are present', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {},
      { idle_losses_kw: 0.2 }
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(
      nextState.batteryEnergyAtEndKwh,
      '0.2 kW idle losses * (15/60)h = 0.05 kWh drawn from the battery'
    ).toBeCloseTo(19.95, 6);
    expectStandardNextStateAttributesPresent(nextState);
  });

  it('causes import when the battery is empty', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      { batteryEnergyAtStartKwh: 0 },
      {},
      { idle_losses_kw: 0.2 }
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(
      nextState.importedEnergyKwh,
      '0.2 kW idle losses * (15/60)h = 0.05 kWh imported'
    ).toBeCloseTo(0.05, 6);
    expectStandardNextStateAttributesPresent(nextState);
  });

  it('defaults to no idle losses', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        productionPowerKw: 4,
      },
      {}
    );

    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(21, 6);
    expectStandardNextStateAttributesPresent(nextState);
  });
});
