/**
 * Domain object representing the electrical power balance of a timestep.
 *
 * Positive values mean surplus power available for the battery/grid.
 * Negative values mean a power demand that must be supplied.
 */
import { getExtraLoadPowerKw } from '../simulation/extra-loads.js';

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

    powerBalance -= getExtraLoadPowerKw(
      timestep.extraLoads,
      timestep.start,
      timestep.end
    );

    return new PowerBalance(powerBalance)
  }
}
