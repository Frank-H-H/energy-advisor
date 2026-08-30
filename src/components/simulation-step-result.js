/**
 * Result of simulating one timestep part.
 *
 * The result contains the values produced by one simulation interval.
 * When a timestep is split, consecutive results can be combined.
 */
export class SimulationStepResult {
  constructor({
    batteryEnergyAtEnd = 0,
    exportedEnergy = 0,
    importedEnergy = 0,
    missedProduction = 0,
    extraConsumedEnergy = 0,
  } = {}) {
    this.batteryEnergyAtEnd = batteryEnergyAtEnd;
    this.exportedEnergy = exportedEnergy;
    this.importedEnergy = importedEnergy;
    this.missedProduction = missedProduction;
    this.extraConsumedEnergy = extraConsumedEnergy;
  }

  static fromTimestep(timestep) {
    return new SimulationStepResult({
      batteryEnergyAtEnd: timestep.batteryEnergyAtEnd,
      exportedEnergy: timestep.exportedEnergy,
      importedEnergy: timestep.importedEnergy,
      missedProduction: timestep.missedProduction,
      extraConsumedEnergy: timestep.extraConsumedEnergy,
    });
  }

  static combine(first, second) {
    return new SimulationStepResult({
      // The end state of consecutive intervals is the end state of the
      // second interval.
      batteryEnergyAtEnd: second.batteryEnergyAtEnd,
      exportedEnergy: first.exportedEnergy + second.exportedEnergy,
      importedEnergy: first.importedEnergy + second.importedEnergy,
      missedProduction: first.missedProduction + second.missedProduction,
      extraConsumedEnergy:
        first.extraConsumedEnergy + second.extraConsumedEnergy,
    });
  }

  applyTo(timestep) {
    timestep.batteryEnergyAtEnd = this.batteryEnergyAtEnd;
    timestep.exportedEnergy = this.exportedEnergy;
    timestep.importedEnergy = this.importedEnergy;
    timestep.missedProduction = this.missedProduction;
    timestep.extraConsumedEnergy = this.extraConsumedEnergy;
    return timestep;
  }
}
