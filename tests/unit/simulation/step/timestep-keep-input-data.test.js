// tests/unit/step-full.test.js
import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep keeps input data', () => {
  it('for partial current frame', () => {
    const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
      {},
      {
        expectedProductionPower: 6,
        expectedConsumptionPower: 3,
        gridTarget: 0.6,
        extraConsumptionPower: 2.1,
        extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        someExtraAttribute: 'someValue',
      }
    );
    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.expectedProductionPower).toBeCloseTo(6);
    expect(nextState.expectedConsumptionPower).toBeCloseTo(3);
    expect(nextState.gridTarget).toBeCloseTo(0.6);
    expect(nextState.extraConsumptionPower).toBeCloseTo(2.1);
    expect(nextState.extraConsumptionEndsAt).toBeCloseTo(
      new Date('2026-04-08T14:00:00.000Z')
    );
    expect(nextState.someExtraAttribute).toBe('someValue');
    expectStandardNextStateAttributesPresent(nextState);
  });

  it('for full future frame', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        expectedProductionPower: 6,
        expectedConsumptionPower: 3,
        gridTarget: 0.6,
        extraConsumptionPower: 2.1,
        extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z'),
        someExtraAttribute: 'someValue',
      }
    );
    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.expectedProductionPower).toBeCloseTo(6);
    expect(nextState.expectedConsumptionPower).toBeCloseTo(3);
    expect(nextState.gridTarget).toBeCloseTo(0.6);
    expect(nextState.extraConsumptionPower).toBeCloseTo(2.1);
    expect(nextState.extraConsumptionEndsAt).toBeCloseTo(
      new Date('2026-04-08T14:00:00.000Z')
    );
    expect(nextState.someExtraAttribute).toBe('someValue');
    expectStandardNextStateAttributesPresent(nextState);
  });
});
