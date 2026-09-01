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
      timestep.productionPowerKw -
      timestep.consumptionPowerKw +
      timestep.gridTargetPowerKw

    if (typeof timestep.prematureExportPowerKw !== 'undefined') {
      powerBalance -= timestep.prematureExportPowerKw
    }

    if (
      timestep.extraConsumptionPowerKw &&
      isBefore(timestep.start, timestep.extraConsumptionEndsAt)
    ) {
      powerBalance -= timestep.extraConsumptionPowerKw
    }

    return new PowerBalance(powerBalance)
  }
}
