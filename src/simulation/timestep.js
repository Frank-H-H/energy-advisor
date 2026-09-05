import { Battery } from '../components/battery.js';
import { PowerBalance } from '../components/power-balance.js';
import { SimulationStepResult } from '../components/simulation-step-result.js';
import { Timestep } from '../components/timestep.js';
import {
  getExtraLoadBoundaryPoints,
  getExtraLoadEnergyKwh,
  normalizeExtraLoads,
} from './extra-loads.js';
import {
  addMilliseconds,
  differenceInMilliseconds,
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
 * - computes exportedEnergyKwh, importedEnergyKwh, missedProductionEnergyKwh, extraConsumedEnergyKwh and resulting SOC
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

  timestep.batteryEnergyAtStartKwh = state.batteryEnergyAtStartKwh;
  // normalize inputs
  timestep.productionPowerKw = Number(timestep.productionPowerKw || 0);
  timestep.consumptionPowerKw = Number(timestep.consumptionPowerKw || 0);
  timestep.gridTargetPowerKw = Number(timestep.gridTargetPowerKw || 0);
  timestep.prematureExportPowerKw = Number(
    timestep.prematureExportPowerKw || 0
  );
  timestep.extraLoads = normalizeExtraLoads(timestep.extraLoads);

  timestep.importPricePerKwh = timestep.importPricePerKwh || null;
  timestep.exportPricePerKwh = timestep.exportPricePerKwh || null;

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
      timestep.batteryEnergyAtStartKwh =
        timestepPartsToSimulate[index - 1].batteryEnergyAtEndKwh;
    }
    internalSimulateTimestep(timestep, true);
  }

  if (timestepPartsToSimulate.length >= 1) {
    const result = timestepPartsToSimulate
      .map((part) => SimulationStepResult.fromTimestep(part))
      .reduce((combined, part) => SimulationStepResult.combine(combined, part));
    result.applyTo(timestep);
  } else {
    new SimulationStepResult({
      batteryEnergyAtEndKwh: timestep.batteryEnergyAtStartKwh,
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
    for (const boundary of getExtraLoadBoundaryPoints(
      timestep.extraLoads,
      timestep
    )) {
      if (isAfter(boundary, timeToStart)) {
        timePointsInThisFrame.push(boundary);
      }
    }
    timePointsInThisFrame.sort(
      (first, second) => first.getTime() - second.getTime()
    );
    const uniqueTimePointsInThisFrame = timePointsInThisFrame.filter(
      (point, index, points) =>
        index === 0 || point.getTime() !== points[index - 1].getTime()
    );
    if (!state.DEBUG) {
      timestep.timePointsInThisFrame = uniqueTimePointsInThisFrame;
    }

    const timestepPartsToSimulate = new Array();

    var currentStart = uniqueTimePointsInThisFrame[0];
    for (
      let index = 1;
      index < uniqueTimePointsInThisFrame.length;
      index++
    ) {
      const currentEnd = uniqueTimePointsInThisFrame[index];
      if (
        isBefore(currentStart, currentEnd) &&
        !isBefore(currentStart, timeToStart)
      ) {
        timestepPartsToSimulate.push(
          Timestep.from(timestep).between(currentStart, currentEnd)
        );
      }
      currentStart = currentEnd;
    }
    return timestepPartsToSimulate;
  }

  function internalSimulateTimestep(timestep, continueDeeper) {
    const timestepFraction = getFractionOfHour(timestep);
    const battery = new Battery({
      ...batterySpec,
      soc_kwh: timestep.batteryEnergyAtStartKwh,
    });
    timestep.timestepFraction = timestepFraction;
    const unconstrainedPowerBalance = getPowerBalance(timestep);
    timestep.unconstrainedPowerBalance = unconstrainedPowerBalance;
    const constrainedPowerBalance = getConstrainedPowerBalance(
      unconstrainedPowerBalance
    );
    timestep.constrainedPowerBalance = constrainedPowerBalance;
    timestep.missedProductionEnergyKwh =
      Math.min(
        timestep.productionPowerKw,
        Math.max(0, unconstrainedPowerBalance - constrainedPowerBalance)
      ) * timestepFraction;
    timestep.extraConsumedEnergyKwh = getExtraLoadEnergyKwh(
      timestep.extraLoads,
      timestep.start,
      timestep.end
    );
    if (unconstrainedPowerBalance > 0 && battery.soc >= battery.capacity) {
      // charging, but already full
      timestep.batteryEnergyAtEndKwh = battery.capacity;
      timestep.exportedEnergyKwh = constrainedPowerBalance * timestepFraction;
      timestep.importedEnergyKwh = 0;
      return;
    }
    if (unconstrainedPowerBalance < 0 && battery.soc <= battery.minSoc) {
      // discharging, but already empty
      timestep.batteryEnergyAtEndKwh = battery.minSoc;
      timestep.exportedEnergyKwh = 0;
      timestep.importedEnergyKwh =
        -unconstrainedPowerBalance * timestepFraction;
      return;
    }
    // charging or discharging somewhere in between
    const batteryResult = battery.applyPower(
      unconstrainedPowerBalance,
      timestepFraction
    );
    const limitedBatteryChargePower = batteryResult.appliedPowerKw;
    timestep.limitedBatteryChargePower = limitedBatteryChargePower;
    timestep.missedProductionEnergyKwh =
      Math.min(
        timestep.productionPowerKw,
        Math.max(
          0,
          unconstrainedPowerBalance -
            limitedBatteryChargePower -
            constrainedPowerBalance
        )
      ) * timestepFraction;
    if (limitedBatteryChargePower == 0) {
      // battery state does not chage at all
      timestep.batteryEnergyAtEndKwh = timestep.batteryEnergyAtStartKwh;

      // TODO: THIS WITH GRDID POINT IS UNTESTED
      //timestep.exportedEnergyKwh = Math.max(0, - timestep.gridTargetPowerKw) * timestepFraction
      //timestep.importedEnergyKwh = Math.max(0, timestep.gridTargetPowerKw) * timestepFraction
      timestep.exportedEnergyKwh = 0;
      timestep.importedEnergyKwh = 0;
      return;
    }
    const realBatteryEnergyChange = batteryResult.energyKWh;
    timestep.realBatteryEnergyChange = realBatteryEnergyChange;
    const unconstrainedBatteryEnergyAtEnd = batteryResult.socAtEndKWh;
    timestep.unconstrainedBatteryEnergyAtEnd = unconstrainedBatteryEnergyAtEnd;
    if (batteryResult.reachedFullAtHours !== null) {
      // charging to full
      if (!continueDeeper) {
        timestep.batteryEnergyAtEndKwh = battery.capacity;
        if (timestep.batteryEnergyAtStartKwh < battery.capacity) {
          timestep.exportedEnergyKwh =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            timestepFraction;
        } else {
          timestep.exportedEnergyKwh =
            constrainedPowerBalance * timestepFraction;
        }
        timestep.importedEnergyKwh = 0;
        return;
      }
      const missingChargeOnStart =
        battery.capacity - timestep.batteryEnergyAtStartKwh;
      timestep.missingChargeOnStart = missingChargeOnStart;
      timestep.realBatteryEnergyChange = realBatteryEnergyChange;
      timestep.limitedBatteryChargePower = limitedBatteryChargePower;
      const timePointWhenFull = addMilliseconds(
        timestep.start,
        3600000.0 * batteryResult.reachedFullAtHours
      );
      timestep.timePointWhenFull = timePointWhenFull;

      const [firstTimestep, secondTimestep] =
        Timestep.from(timestep).splitAt(timePointWhenFull);
      firstTimestep.batteryEnergyAtStartKwh = timestep.batteryEnergyAtStartKwh;
      internalSimulateTimestep(firstTimestep, false);
      secondTimestep.batteryEnergyAtStartKwh =
        firstTimestep.batteryEnergyAtEndKwh;
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
        timestep.batteryEnergyAtEndKwh = battery.minSoc;
        timestep.exportedEnergyKwh = 0;
        if (timestep.batteryEnergyAtStartKwh > 0) {
          timestep.importedEnergyKwh =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            timestepFraction;
        } else {
          timestep.importedEnergyKwh = 0 - unconstrainedBatteryEnergyAtEnd;
        }
        return;
      }

      const timePointWhenEmpty = addMilliseconds(
        timestep.start,
        3600000.0 * batteryResult.reachedEmptyAtHours
      );
      timestep.timePointWhenEmpty = timePointWhenEmpty;

      const [firstTimestep, secondTimestep] =
        Timestep.from(timestep).splitAt(timePointWhenEmpty);
      firstTimestep.batteryEnergyAtStartKwh = timestep.batteryEnergyAtStartKwh;
      internalSimulateTimestep(firstTimestep, false);
      secondTimestep.batteryEnergyAtStartKwh =
        firstTimestep.batteryEnergyAtEndKwh;
      internalSimulateTimestep(secondTimestep, false);
      timestep.firstTimestep = firstTimestep;
      timestep.secondTimestep = secondTimestep;
      SimulationStepResult.combine(
        SimulationStepResult.fromTimestep(firstTimestep),
        SimulationStepResult.fromTimestep(secondTimestep)
      ).applyTo(timestep);
    } else {
      timestep.batteryEnergyAtEndKwh = unconstrainedBatteryEnergyAtEnd;
      timestep.exportedEnergyKwh =
        Math.max(0, -timestep.gridTargetPowerKw) * timestepFraction;
      timestep.importedEnergyKwh =
        Math.max(0, timestep.gridTargetPowerKw) * timestepFraction;
      //timestep.exportedEnergyKwh = 0
      //timestep.importedEnergyKwh = 0
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
    const remainingMilliseconds = differenceInMilliseconds(
      timestep.end,
      timestep.start
    );
    return remainingMilliseconds / 3600000;
  }

  function cleanTimesteps(timesteps) {
    for (let index = 0; index < timesteps.length; index++) {
      const timestep = timesteps[index];
      delete timestep.batteryEnergyAtStartKwh;
      delete timestep.batteryEnergyAtEndKwh;
      delete timestep.exportedEnergyKwh;
      delete timestep.importedEnergyKwh;
      delete timestep.missedProductionEnergyKwh;
      delete timestep.extraConsumedEnergyKwh;
    }
  }

  //  const nextState = timestep;
  const outputs = {};
  const diagnostics = {};
  return { nextState: timestep, outputs, diagnostics };
}
