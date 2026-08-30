/**
 * Domain object representing the electrical power balance of a timestep.
 *
 * Positive values mean surplus power available for the battery/grid.
 * Negative values mean a power demand that must be supplied.
 */
import { isBefore } from 'date-fns';

export class PowerBalance {
  constructor(powerKw) {
    this.powerKw = Number(powerKw)
  }

  static fromTimestep(timestep) {
    let powerBalance =
      timestep.expectedProductionPower -
      timestep.expectedConsumptionPower +
      timestep.gridTarget

    if (typeof timestep.prematureExportPower !== 'undefined') {
      powerBalance -= timestep.prematureExportPower
    }

    if (
      timestep.extraConsumptionPower &&
      isBefore(timestep.start, timestep.extraConsumptionEndsAt)
    ) {
      powerBalance -= timestep.extraConsumptionPower
    }

    return new PowerBalance(powerBalance)
  }
}
