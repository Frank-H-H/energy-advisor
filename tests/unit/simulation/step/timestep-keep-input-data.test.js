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
        productionPowerKw: 6,
        consumptionPowerKw: 3,
        gridTargetPowerKw: 0.6,
        extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        someExtraAttribute: 'someValue',
      }
    );
    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.productionPowerKw).toBeCloseTo(6);
    expect(nextState.consumptionPowerKw).toBeCloseTo(3);
    expect(nextState.gridTargetPowerKw).toBeCloseTo(0.6);
    expect(nextState.extraLoads).toEqual([
      {
        name: 'test',
        consumptionPowerKw: 2.1,
        end: new Date('2026-04-08T14:00:00.000Z'),
      },
    ]);
    expect(nextState.someExtraAttribute).toBe('someValue');
    expectStandardNextStateAttributesPresent(nextState);
  });

  it('for full future frame', () => {
    const testFixture = defaultSimpleTestSettingsForFullStepFixture(
      {},
      {
        productionPowerKw: 6,
        consumptionPowerKw: 3,
        gridTargetPowerKw: 0.6,
        extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }],
        someExtraAttribute: 'someValue',
      }
    );
    const { nextState } = simulateTimestep(testFixture);

    expect(nextState.productionPowerKw).toBeCloseTo(6);
    expect(nextState.consumptionPowerKw).toBeCloseTo(3);
    expect(nextState.gridTargetPowerKw).toBeCloseTo(0.6);
    expect(nextState.extraLoads).toEqual([
      {
        name: 'test',
        consumptionPowerKw: 2.1,
        end: new Date('2026-04-08T14:00:00.000Z'),
      },
    ]);
    expect(nextState.someExtraAttribute).toBe('someValue');
    expectStandardNextStateAttributesPresent(nextState);
  });
});
