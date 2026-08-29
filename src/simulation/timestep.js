import {
  addMinutes,
  differenceInMinutes,
  interval,
  isAfter,
  isBefore,
  isWithinInterval,
} from 'date-fns';

/**
 * Simulate a single timestep.
 *
 * This implementation follows the behavior of the Node-RED "SimulateSingleFrame" subflow:
 * - inputs are power values (kW) and converted to energy (kWh) using interval duration
 * - respects battery power limits and SOC bounds
 * - splits the timestep into sub-parts when the battery fills or empties during the timestep
 * - computes exportedEnergy, importedEnergy, missedProduction, extraConsumedEnergy and resulting SOC
 *
 * Signature:
 *   simulateTimestep({ state, timestep, components, options })
 *
 * Returns: { nextState, outputs, diagnostics }
 */

export function simulateTimestep({
  state = {},
  timestep,
  components = {},
  options = {},
}) {
  if (!timestep || !timestep.start || !timestep.end) {
    throw new Error('timestep with start and end required');
  }

  timestep.batteryEnergyAtStart = state.batteryEnergyAtStart;
  // normalize inputs
  timestep.expectedProductionPower = Number(
    timestep.expectedProductionPower || 0
  );
  timestep.expectedConsumptionPower = Number(
    timestep.expectedConsumptionPower || 0
  );
  timestep.targetGridPoint = Number(timestep.targetGrid || 0);
  timestep.prematureExportPower = Number(timestep.prematureExportPower || 0);
  timestep.extraConsumptionPower = Number(timestep.extraConsumptionPower || 0);
  timestep.extraConsumptionEndsAt = timestep.extraConsumptionEndsAt
    ? new Date(timestep.extraConsumptionEndsAt)
    : undefined;

  timestep.importPrice = timestep.importPrice || null;
  timestep.exportPrice = timestep.exportPrice || null;

  const batterySpec = components.battery || {};
  const gridSpec = components.grid || {};
  const CAPACITY = Number(batterySpec.capacity_kwh ?? 10);
  const MAX_CHARGE = Number(batterySpec.max_charge_power_kw ?? Infinity);
  const MAX_DISCHARGE = Number(batterySpec.max_discharge_power_kw ?? Infinity);
  const CHARGE_EFF = Number(batterySpec.charge_efficiency ?? 1);
  const DISCHARGE_EFF = Number(batterySpec.discharge_efficiency ?? 1);
  const MIN_SOC = Number(batterySpec.min_soc_kwh ?? 0);

  const MAX_EXPORT = Number(
    gridSpec.max_export_power_kw ?? gridSpec.KW_MAX_EXPORT_POWER ?? Infinity
  );

  let socStart = Number(
    state.battery_soc_kwh ??
      state.batteryEnergyAtStart ??
      batterySpec.soc_kwh ??
      0
  );

  // helpers
  const toHours = (ms) => ms / 3600000;
  const timestepFraction = () =>
    toHours(
      new Date(timestep.end).getTime() - new Date(timestep.start).getTime()
    );

  const timestepPartsToSimulate = computeTimestepPartsToSimulate(
    state,
    timestep
  );
  //  if (DEBUG) {
  //      timestep.timestepPartsToSimulate = timestepPartsToSimulate
  //  }

  for (let index = 0; index < timestepPartsToSimulate.length; index++) {
    const timestep = timestepPartsToSimulate[index];
    if (index == 0) {
      timestep.batteryEnergyAtStart = timestep.batteryEnergyAtStart;
    } else {
      timestep.batteryEnergyAtStart =
        timestepPartsToSimulate[index - 1].batteryEnergyAtEnd;
    }
    internalSimulateTimestep(timestep, timestep, true);
  }

  if (timestepPartsToSimulate.length >= 1) {
    timestep.batteryEnergyAtEnd =
      timestepPartsToSimulate[
        timestepPartsToSimulate.length - 1
      ].batteryEnergyAtEnd;
    timestep.exportedEnergy = timestepPartsToSimulate.reduce(
      (a, c) => a + c.exportedEnergy,
      0
    );
    timestep.importedEnergy = timestepPartsToSimulate.reduce(
      (a, c) => a + c.importedEnergy,
      0
    );
    timestep.missedProduction = timestepPartsToSimulate.reduce(
      (a, c) => a + c.missedProduction,
      0
    );
    timestep.extraConsumedEnergy = timestepPartsToSimulate.reduce(
      (a, c) => a + c.extraConsumedEnergy,
      0
    );
  } else {
    timestep.batteryEnergyAtEnd = timestep.batteryEnergyAtStart;
    timestep.exportedEnergy = 0;
    timestep.importedEnergy = 0;
    timestep.missedProduction = 0;
    timestep.extraConsumedEnergy = 0;
  }

  //  if(!DEBUG) {
  //      cleanTimesteps(timestepPartsToSimulate)
  //  }

  function computeTimestepPartsToSimulate(state, timestep) {
    const timePointsInThisFrame = new Array();

    var timeToStart = timestep.start;
    if (isWithinInterval(state.time, timestep)) {
      // don't need to start at beginning
      timePointsInThisFrame.push(state.time);
      timeToStart = state.time;
    } else {
      timePointsInThisFrame.push(timestep.start);
    }
    timePointsInThisFrame.push(timestep.end);
    if (
      typeof timestep.extraConsumptionPower !== 'undefined' &&
      isWithinInterval(timestep.extraConsumptionEndsAt, timestep)
    ) {
      if (isAfter(timestep.extraConsumptionEndsAt, timeToStart)) {
        timePointsInThisFrame.push(timestep.extraConsumptionEndsAt);
      }
    }
    timePointsInThisFrame.sort();
    //    if (DEBUG) {
    //        timestep.timePointsInThisFrame = timePointsInThisFrame
    //    }

    const timestepPartsToSimulate = new Array();

    var currentStart = timePointsInThisFrame[0];
    for (let index = 1; index < timePointsInThisFrame.length; index++) {
      const currentEnd = timePointsInThisFrame[index];
      if (!isBefore(timeToStart, currentStart)) {
        timestepPartsToSimulate.push({
          ...timestep,
          ...interval(currentStart, currentEnd),
        });
      }
      currentStart = currentEnd;
    }
    return timestepPartsToSimulate;
  }

  function internalSimulateTimestep(timestep, message, continueDeeper) {
    const timestepFraction = getFractionOfHour(timestep);
    timestep.timestepFraction = timestepFraction;
    const unconstrainedPowerBalance = getPowerBalance(timestep, message);
    timestep.unconstrainedPowerBalance = unconstrainedPowerBalance;
    const constrainedPowerBalance = getConstrainedPowerBalance(
      unconstrainedPowerBalance
    );
    timestep.constrainedPowerBalance = constrainedPowerBalance;
    timestep.missedProduction =
      Math.min(
        message.expectedProductionPower,
        Math.max(0, unconstrainedPowerBalance - constrainedPowerBalance)
      ) * timestepFraction;
    if (!isBefore(message.extraConsumptionEndsAt, timestep.end)) {
      timestep.extraConsumedEnergy =
        message.extraConsumptionPower * timestepFraction;
    } else {
      timestep.extraConsumedEnergy = 0;
    }
    if (
      unconstrainedPowerBalance > 0 &&
      timestep.batteryEnergyAtStart >= CAPACITY
    ) {
      // charging, but already full
      timestep.batteryEnergyAtEnd = CAPACITY;
      timestep.exportedEnergy = constrainedPowerBalance * timestepFraction;
      timestep.importedEnergy = 0;
      return;
    }
    if (unconstrainedPowerBalance < 0 && timestep.batteryEnergyAtStart <= 0) {
      // discharging, but already empty
      timestep.batteryEnergyAtEnd = 0;
      timestep.exportedEnergy = 0;
      timestep.importedEnergy = -unconstrainedPowerBalance * timestepFraction;
      return;
    }
    // charging or discharging somewhere in between
    let limitedBatteryChargePower = limitToBatteryCharge(
      unconstrainedPowerBalance
    );
    timestep.limitedBatteryChargePower = limitedBatteryChargePower;
    timestep.missedProduction =
      Math.min(
        message.expectedProductionPower,
        Math.max(
          0,
          unconstrainedPowerBalance -
            limitedBatteryChargePower -
            constrainedPowerBalance
        )
      ) * timestepFraction;
    if (limitedBatteryChargePower == 0) {
      // battery state does not chage at all
      timestep.batteryEnergyAtEnd = timestep.batteryEnergyAtStart;

      // TODO: THIS WITH GRDID POINT IS UNTESTED
      //timestep.exportedEnergy = Math.max(0, - message.targetGridPoint) * timestepFraction
      //timestep.importedEnergy = Math.max(0, message.targetGridPoint) * timestepFraction
      timestep.exportedEnergy = 0;
      timestep.importedEnergy = 0;
      return;
    }
    const realBatteryEnergyChange =
      limitedBatteryChargePower * timestepFraction;
    timestep.realBatteryEnergyChange = realBatteryEnergyChange;
    const unconstrainedBatteryEnergyAtEnd =
      timestep.batteryEnergyAtStart + realBatteryEnergyChange;
    timestep.unconstrainedBatteryEnergyAtEnd = unconstrainedBatteryEnergyAtEnd;
    if (unconstrainedBatteryEnergyAtEnd >= CAPACITY) {
      // charging to full
      if (!continueDeeper) {
        timestep.batteryEnergyAtEnd = CAPACITY;
        if (timestep.batteryEnergyAtStart < CAPACITY) {
          timestep.exportedEnergy =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            timestepFraction;
        } else {
          timestep.exportedEnergy = constrainedPowerBalance * timestepFraction;
        }
        timestep.importedEnergy = 0;
        return;
      }
      const missingChargeOnStart = CAPACITY - timestep.batteryEnergyAtStart;
      timestep.missingChargeOnStart = missingChargeOnStart;
      timestep.realBatteryEnergyChange = realBatteryEnergyChange;
      timestep.limitedBatteryChargePower = limitedBatteryChargePower;
      const timePointWhenFull = addMinutes(
        timestep.start,
        (60.0 * missingChargeOnStart) / limitedBatteryChargePower
      );
      timestep.timePointWhenFull = timePointWhenFull;

      const firstTimestep = interval(timestep.start, timePointWhenFull);
      const secondTimestep = interval(timePointWhenFull, timestep.end);
      firsttimestep.batteryEnergyAtStart = timestep.batteryEnergyAtStart;
      internalSimulateTimestep(firstTimestep, message, false);
      secondtimestep.batteryEnergyAtStart = firsttimestep.batteryEnergyAtEnd;
      internalSimulateTimestep(secondTimestep, message, false);
      timestep.firstTimestep = firstTimestep;
      timestep.secondTimestep = secondTimestep;
      timestep.exportedEnergy =
        firsttimestep.exportedEnergy + secondtimestep.exportedEnergy;
      timestep.importedEnergy =
        firsttimestep.importedEnergy + secondtimestep.importedEnergy;
      timestep.missedProduction =
        firsttimestep.missedProduction + secondtimestep.missedProduction;
      timestep.extraConsumedEnergy =
        firsttimestep.extraConsumedEnergy + secondtimestep.extraConsumedEnergy;

      timestep.batteryEnergyAtEnd = timestep.secondtimestep.batteryEnergyAtEnd;
    } else if (unconstrainedBatteryEnergyAtEnd <= 0) {
      // discharging to empty
      if (!continueDeeper) {
        timestep.batteryEnergyAtEnd = 0;
        timestep.exportedEnergy = 0;
        if (timestep.batteryEnergyAtStart > 0) {
          timestep.importedEnergy =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            timestepFraction;
        } else {
          timestep.importedEnergy = 0 - unconstrainedBatteryEnergyAtEnd;
        }
        return;
      }

      const timePointWhenEmpty = addMinutes(
        timestep.start,
        (60.0 * timestep.batteryEnergyAtStart) / -limitedBatteryChargePower
      );
      timestep.timePointWhenEmpty = timePointWhenEmpty;

      const firstTimestep = interval(timestep.start, timePointWhenEmpty);
      const secondTimestep = interval(timePointWhenEmpty, timestep.end);
      firsttimestep.batteryEnergyAtStart = timestep.batteryEnergyAtStart;
      internalSimulateTimestep(firstTimestep, message, false);
      secondtimestep.batteryEnergyAtStart = firsttimestep.batteryEnergyAtEnd;
      internalSimulateTimestep(secondTimestep, message, false);
      timestep.firstTimestep = firstTimestep;
      timestep.secondTimestep = secondTimestep;
      timestep.exportedEnergy =
        firsttimestep.exportedEnergy + secondtimestep.exportedEnergy;
      timestep.importedEnergy =
        firsttimestep.importedEnergy + secondtimestep.importedEnergy;
      timestep.missedProduction =
        firsttimestep.missedProduction + secondtimestep.missedProduction;
      timestep.extraConsumedEnergy =
        firsttimestep.extraConsumedEnergy + secondtimestep.extraConsumedEnergy;

      timestep.batteryEnergyAtEnd = timestep.secondtimestep.batteryEnergyAtEnd;
    } else {
      timestep.batteryEnergyAtEnd = unconstrainedBatteryEnergyAtEnd;
      timestep.exportedEnergy =
        Math.max(0, -message.targetGridPoint) * timestepFraction;
      timestep.importedEnergy =
        Math.max(0, message.targetGridPoint) * timestepFraction;
      //timestep.exportedEnergy = 0
      //timestep.importedEnergy = 0
    }
  }

  function getPowerBalance(timestep) {
    var powerBalance =
      timestep.expectedProductionPower -
      timestep.expectedConsumptionPower +
      timestep.targetGridPoint;
    if (typeof timestep.prematureExportPower !== 'undefined') {
      powerBalance -= timestep.prematureExportPower;
    }
    if (
      timestep.extraConsumptionPower &&
      isBefore(timestep.start, timestep.extraConsumptionEndsAt)
    ) {
      powerBalance -= timestep.extraConsumptionPower;
    }
    return powerBalance;
  }

  function getConstrainedPowerBalance(powerBalance) {
    if (powerBalance > MAX_EXPORT) {
      return MAX_EXPORT;
    }
    return powerBalance;
  }

  function limitToBatteryCharge(powerBalance) {
    if (powerBalance > MAX_CHARGE) {
      return MAX_CHARGE;
    }
    if (powerBalance < -MAX_CHARGE) {
      return -MAX_CHARGE;
    }
    return powerBalance;
  }

  function getFractionOfHour(timestep) {
    const remainingMinutes = differenceInMinutes(timestep.end, timestep.start);
    return remainingMinutes / 60;
  }

  function cleanTimesteps(timesteps) {
    for (let index = 0; index < timesteps.length; index++) {
      const timestep = timesteps[index];
      delete timestep.batteryEnergyAtStart;
      delete timestep.batteryEnergyAtEnd;
      delete timestep.exportedEnergy;
      delete timestep.importedEnergy;
      delete timestep.missedProduction;
      delete timestep.extraConsumedEnergy;
    }
  }

  //  const nextState = timestep;
  const outputs = {};
  const diagnostics = {};
  return { nextState: timestep, outputs, diagnostics };
}
