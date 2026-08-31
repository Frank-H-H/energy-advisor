/**
 * Result of simulating one timestep part.
 *
 * The result contains the values produced by one simulation interval.
 * When a timestep is split, consecutive results can be combined.
 */
export class SimulationStepResult {
  constructor({
    batteryEnergyAtEndKwh = 0,
    exportedEnergyKwh = 0,
    importedEnergyKwh = 0,
    missedProductionEnergyKwh = 0,
    extraConsumedEnergyKwh = 0,
  } = {}) {
    this.batteryEnergyAtEndKwh = batteryEnergyAtEndKwh;
    this.exportedEnergyKwh = exportedEnergyKwh;
    this.importedEnergyKwh = importedEnergyKwh;
    this.missedProductionEnergyKwh = missedProductionEnergyKwh;
    this.extraConsumedEnergyKwh = extraConsumedEnergyKwh;
  }

  static fromTimestep(timestep) {
    return new SimulationStepResult({
      batteryEnergyAtEndKwh: timestep.batteryEnergyAtEndKwh,
      exportedEnergyKwh: timestep.exportedEnergyKwh,
      importedEnergyKwh: timestep.importedEnergyKwh,
      missedProductionEnergyKwh: timestep.missedProductionEnergyKwh,
      extraConsumedEnergyKwh: timestep.extraConsumedEnergyKwh,
    });
  }

  static combine(first, second) {
    return new SimulationStepResult({
      // The end state of consecutive intervals is the end state of the
      // second interval.
      batteryEnergyAtEndKwh: second.batteryEnergyAtEndKwh,
      exportedEnergyKwh: first.exportedEnergyKwh + second.exportedEnergyKwh,
      importedEnergyKwh: first.importedEnergyKwh + second.importedEnergyKwh,
      missedProductionEnergyKwh: first.missedProductionEnergyKwh + second.missedProductionEnergyKwh,
      extraConsumedEnergyKwh:
        first.extraConsumedEnergyKwh + second.extraConsumedEnergyKwh,
    });
  }

  applyTo(timestep) {
    timestep.batteryEnergyAtEndKwh = this.batteryEnergyAtEndKwh;
    timestep.exportedEnergyKwh = this.exportedEnergyKwh;
    timestep.importedEnergyKwh = this.importedEnergyKwh;
    timestep.missedProductionEnergyKwh = this.missedProductionEnergyKwh;
    timestep.extraConsumedEnergyKwh = this.extraConsumedEnergyKwh;
    return timestep;
  }
}
