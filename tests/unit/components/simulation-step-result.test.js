import { describe, expect, it } from 'vitest';
import { SimulationStepResult } from '../../../src/components/simulation-step-result.js';

describe('SimulationStepResult', () => {
  it('creates a result from a simulated timestep', () => {
    const timestep = {
      batteryEnergyAtEndKwh: 7,
      exportedEnergyKwh: 1.2,
      importedEnergyKwh: 0.3,
      missedProductionEnergyKwh: 0.4,
      extraConsumedEnergyKwh: 0.5,
    };

    const result = SimulationStepResult.fromTimestep(timestep);

    expect(result).toEqual({
      batteryEnergyAtEndKwh: 7,
      exportedEnergyKwh: 1.2,
      importedEnergyKwh: 0.3,
      missedProductionEnergyKwh: 0.4,
      extraConsumedEnergyKwh: 0.5,
    });
  });

  it('combines consecutive step results', () => {
    const first = new SimulationStepResult({
      batteryEnergyAtEndKwh: 8,
      exportedEnergyKwh: 1,
      importedEnergyKwh: 0.2,
      missedProductionEnergyKwh: 0.3,
      extraConsumedEnergyKwh: 0.4,
    });
    const second = new SimulationStepResult({
      batteryEnergyAtEndKwh: 9,
      exportedEnergyKwh: 2,
      importedEnergyKwh: 0.5,
      missedProductionEnergyKwh: 0.6,
      extraConsumedEnergyKwh: 0.7,
    });

    const result = SimulationStepResult.combine(first, second);

    expect(result.batteryEnergyAtEndKwh).toBe(9);
    expect(result.exportedEnergyKwh).toBe(3);
    expect(result.importedEnergyKwh).toBeCloseTo(0.7);
    expect(result.missedProductionEnergyKwh).toBeCloseTo(0.9);
    expect(result.extraConsumedEnergyKwh).toBeCloseTo(1.1);
  });

  it('uses the second result as the end state of a combined interval', () => {
    const first = new SimulationStepResult({ batteryEnergyAtEndKwh: 8 });
    const second = new SimulationStepResult({ batteryEnergyAtEndKwh: 3 });

    const result = SimulationStepResult.combine(first, second);

    expect(result.batteryEnergyAtEndKwh).toBe(3);
  });

  it('applies the result to an existing timestep', () => {
    const timestep = {
      batteryEnergyAtStartKwh: 4,
      someInput: 'unchanged',
    };

    const result = new SimulationStepResult({
      batteryEnergyAtEndKwh: 6,
      exportedEnergyKwh: 1,
      importedEnergyKwh: 2,
      missedProductionEnergyKwh: 3,
      extraConsumedEnergyKwh: 4,
    });

    const returned = result.applyTo(timestep);

    expect(returned).toBe(timestep);
    expect(timestep).toEqual({
      batteryEnergyAtStartKwh: 4,
      someInput: 'unchanged',
      batteryEnergyAtEndKwh: 6,
      exportedEnergyKwh: 1,
      importedEnergyKwh: 2,
      missedProductionEnergyKwh: 3,
      extraConsumedEnergyKwh: 4,
    });
  });
});
