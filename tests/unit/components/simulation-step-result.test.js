import { describe, expect, it } from 'vitest';
import { SimulationStepResult } from '../../../src/components/simulation-step-result.js';

describe('SimulationStepResult', () => {
  it('creates a result from a simulated timestep', () => {
    const timestep = {
      batteryEnergyAtEnd: 7,
      exportedEnergy: 1.2,
      importedEnergy: 0.3,
      missedProduction: 0.4,
      extraConsumedEnergy: 0.5,
    };

    const result = SimulationStepResult.fromTimestep(timestep);

    expect(result).toEqual({
      batteryEnergyAtEnd: 7,
      exportedEnergy: 1.2,
      importedEnergy: 0.3,
      missedProduction: 0.4,
      extraConsumedEnergy: 0.5,
    });
  });

  it('combines consecutive step results', () => {
    const first = new SimulationStepResult({
      batteryEnergyAtEnd: 8,
      exportedEnergy: 1,
      importedEnergy: 0.2,
      missedProduction: 0.3,
      extraConsumedEnergy: 0.4,
    });
    const second = new SimulationStepResult({
      batteryEnergyAtEnd: 9,
      exportedEnergy: 2,
      importedEnergy: 0.5,
      missedProduction: 0.6,
      extraConsumedEnergy: 0.7,
    });

    const result = SimulationStepResult.combine(first, second);

    expect(result.batteryEnergyAtEnd).toBe(9);
    expect(result.exportedEnergy).toBe(3);
    expect(result.importedEnergy).toBeCloseTo(0.7);
    expect(result.missedProduction).toBeCloseTo(0.9);
    expect(result.extraConsumedEnergy).toBeCloseTo(1.1);
  });

  it('uses the second result as the end state of a combined interval', () => {
    const first = new SimulationStepResult({ batteryEnergyAtEnd: 8 });
    const second = new SimulationStepResult({ batteryEnergyAtEnd: 3 });

    const result = SimulationStepResult.combine(first, second);

    expect(result.batteryEnergyAtEnd).toBe(3);
  });

  it('applies the result to an existing timestep', () => {
    const timestep = {
      batteryEnergyAtStart: 4,
      someInput: 'unchanged',
    };

    const result = new SimulationStepResult({
      batteryEnergyAtEnd: 6,
      exportedEnergy: 1,
      importedEnergy: 2,
      missedProduction: 3,
      extraConsumedEnergy: 4,
    });

    const returned = result.applyTo(timestep);

    expect(returned).toBe(timestep);
    expect(timestep).toEqual({
      batteryEnergyAtStart: 4,
      someInput: 'unchanged',
      batteryEnergyAtEnd: 6,
      exportedEnergy: 1,
      importedEnergy: 2,
      missedProduction: 3,
      extraConsumedEnergy: 4,
    });
  });
});
