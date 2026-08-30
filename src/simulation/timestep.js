import { Battery } from '../components/battery.js';
import { PowerBalance } from '../components/power-balance.js';
import { SimulationStepResult } from '../components/simulation-step-result.js';
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

export function simulateTimestep({ state = {}, timestep, components = {} }) {
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
  timestep.gridTarget = Number(timestep.gridTarget || 0);
  timestep.prematureExportPower = Number(timestep.prematureExportPower || 0);
  timestep.extraConsumptionPower = Number(timestep.extraConsumptionPower || 0);
  timestep.extraConsumptionEndsAt = timestep.extraConsumptionEndsAt
    ? new Date(timestep.extraConsumptionEndsAt)
    : undefined;

  timestep.importPrice = timestep.importPrice || null;
  timestep.exportPrice = timestep.exportPrice || null;

  const batterySpec = components.battery || {};
  const gridSpec = components.grid || {};
  const MAX_EXPORT = Number(
    gridSpec.max_export_power_kw ?? gridSpec.KW_MAX_EXPORT_POWER ?? Infinity
  );

  // helpers

  const timestepPartsToSimulate = computeTimestepPartsToSimulate(
    state,
    timestep
  );
  if (!state.DEBUG) {
    timestep.timestepPartsToSimulate = timestepPartsToSimulate;
  }

  for (let index = 0; index < timestepPartsToSimulate.length; index++) {
    const timestep = timestepPartsToSimulate[index];
    if (index == 0) {
      // do nothing
    } else {
      timestep.batteryEnergyAtStart =
        timestepPartsToSimulate[index - 1].batteryEnergyAtEnd;
    }
    internalSimulateTimestep(timestep, true);
  }

  if (timestepPartsToSimulate.length >= 1) {
    const result = timestepPartsToSimulate
      .map((part) => SimulationStepResult.fromTimestep(part))
      .reduce(
        (combined, part) => SimulationStepResult.combine(combined, part)
      );
    result.applyTo(timestep);
  } else {
    new SimulationStepResult({
      batteryEnergyAtEnd: timestep.batteryEnergyAtStart,
    }).applyTo(timestep);
  }

  if (!state.DEBUG) {
    cleanTimesteps(timestepPartsToSimulate);
  }

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
    if (!state.DEBUG) {
      timestep.timePointsInThisFrame = timePointsInThisFrame;
    }

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

  function internalSimulateTimestep(timestep, continueDeeper) {
    const timestepFraction = getFractionOfHour(timestep);
    const battery = new Battery({
      ...batterySpec,
      soc_kwh: timestep.batteryEnergyAtStart,
    });
    timestep.timestepFraction = timestepFraction;
    const unconstrainedPowerBalance = getPowerBalance(timestep);
    timestep.unconstrainedPowerBalance = unconstrainedPowerBalance;
    const constrainedPowerBalance = getConstrainedPowerBalance(
      unconstrainedPowerBalance
    );
    timestep.constrainedPowerBalance = constrainedPowerBalance;
    timestep.missedProduction =
      Math.min(
        timestep.expectedProductionPower,
        Math.max(0, unconstrainedPowerBalance - constrainedPowerBalance)
      ) * timestepFraction;
    if (!isBefore(timestep.extraConsumptionEndsAt, timestep.end)) {
      timestep.extraConsumedEnergy =
        timestep.extraConsumptionPower * timestepFraction;
    } else {
      timestep.extraConsumedEnergy = 0;
    }
    if (unconstrainedPowerBalance > 0 && battery.soc >= battery.capacity) {
      // charging, but already full
      timestep.batteryEnergyAtEnd = battery.capacity;
      timestep.exportedEnergy = constrainedPowerBalance * timestepFraction;
      timestep.importedEnergy = 0;
      return;
    }
    if (unconstrainedPowerBalance < 0 && battery.soc <= battery.minSoc) {
      // discharging, but already empty
      timestep.batteryEnergyAtEnd = battery.minSoc;
      timestep.exportedEnergy = 0;
      timestep.importedEnergy = -unconstrainedPowerBalance * timestepFraction;
      return;
    }
    // charging or discharging somewhere in between
    const batteryResult = battery.applyPower(
      unconstrainedPowerBalance,
      timestepFraction
    );
    const limitedBatteryChargePower = batteryResult.appliedPowerKw;
    timestep.limitedBatteryChargePower = limitedBatteryChargePower;
    timestep.missedProduction =
      Math.min(
        timestep.expectedProductionPower,
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
      //timestep.exportedEnergy = Math.max(0, - timestep.gridTarget) * timestepFraction
      //timestep.importedEnergy = Math.max(0, timestep.gridTarget) * timestepFraction
      timestep.exportedEnergy = 0;
      timestep.importedEnergy = 0;
      return;
    }
    const realBatteryEnergyChange = batteryResult.energyKWh;
    timestep.realBatteryEnergyChange = realBatteryEnergyChange;
    const unconstrainedBatteryEnergyAtEnd = batteryResult.socAtEndKWh;
    timestep.unconstrainedBatteryEnergyAtEnd = unconstrainedBatteryEnergyAtEnd;
    if (batteryResult.reachedFullAtHours !== null) {
      // charging to full
      if (!continueDeeper) {
        timestep.batteryEnergyAtEnd = battery.capacity;
        if (timestep.batteryEnergyAtStart < battery.capacity) {
          timestep.exportedEnergy =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            timestepFraction;
        } else {
          timestep.exportedEnergy = constrainedPowerBalance * timestepFraction;
        }
        timestep.importedEnergy = 0;
        return;
      }
      const missingChargeOnStart =
        battery.capacity - timestep.batteryEnergyAtStart;
      timestep.missingChargeOnStart = missingChargeOnStart;
      timestep.realBatteryEnergyChange = realBatteryEnergyChange;
      timestep.limitedBatteryChargePower = limitedBatteryChargePower;
      const timePointWhenFull = addMinutes(
        timestep.start,
        60.0 * batteryResult.reachedFullAtHours
      );
      timestep.timePointWhenFull = timePointWhenFull;

      const firstTimestep = {
        ...timestep,
        ...interval(timestep.start, timePointWhenFull),
      };
      const secondTimestep = {
        ...timestep,
        ...interval(timePointWhenFull, timestep.end),
      };
      firstTimestep.batteryEnergyAtStart = timestep.batteryEnergyAtStart;
      internalSimulateTimestep(firstTimestep, false);
      secondTimestep.batteryEnergyAtStart = firstTimestep.batteryEnergyAtEnd;
      internalSimulateTimestep(secondTimestep, false);
      timestep.firstTimestep = firstTimestep;
      timestep.secondTimestep = secondTimestep;
      SimulationStepResult.combine(
        SimulationStepResult.fromTimestep(firstTimestep),
        SimulationStepResult.fromTimestep(secondTimestep)
      ).applyTo(timestep);
    } else if (batteryResult.reachedEmptyAtHours !== null) {
      // discharging to empty
      if (!continueDeeper) {
        timestep.batteryEnergyAtEnd = battery.minSoc;
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
        60.0 * batteryResult.reachedEmptyAtHours
      );
      timestep.timePointWhenEmpty = timePointWhenEmpty;

      const firstTimestep = {
        ...timestep,
        ...interval(timestep.start, timePointWhenEmpty),
      };
      const secondTimestep = {
        ...timestep,
        ...interval(timePointWhenEmpty, timestep.end),
      };
      firstTimestep.batteryEnergyAtStart = timestep.batteryEnergyAtStart;
      internalSimulateTimestep(firstTimestep, false);
      secondTimestep.batteryEnergyAtStart = firstTimestep.batteryEnergyAtEnd;
      internalSimulateTimestep(secondTimestep, false);
      timestep.firstTimestep = firstTimestep;
      timestep.secondTimestep = secondTimestep;
      SimulationStepResult.combine(
        SimulationStepResult.fromTimestep(firstTimestep),
        SimulationStepResult.fromTimestep(secondTimestep)
      ).applyTo(timestep);
    } else {
      timestep.batteryEnergyAtEnd = unconstrainedBatteryEnergyAtEnd;
      timestep.exportedEnergy =
        Math.max(0, -timestep.gridTarget) * timestepFraction;
      timestep.importedEnergy =
        Math.max(0, timestep.gridTarget) * timestepFraction;
      //timestep.exportedEnergy = 0
      //timestep.importedEnergy = 0
    }
  }

  function getPowerBalance(timestep) {
    return PowerBalance.fromTimestep(timestep).powerKw;
  }

  function getConstrainedPowerBalance(powerBalance) {
    if (powerBalance > MAX_EXPORT) {
      return MAX_EXPORT;
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
