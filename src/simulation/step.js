// src/simulation/step.js

/**
 * Simulate a single timestep (interval).
 *
 * This implementation follows the behavior of the Node-RED "SimulateSingleFrame" subflow:
 * - inputs are power values (kW) and converted to energy (kWh) using interval duration
 * - respects battery power limits and SOC bounds
 * - splits the interval into sub-parts when the battery fills or empties during the interval
 * - computes exportedEnergy, importedEnergy, missedProduction, extraConsumedEnergy and resulting SOC
 *
 * Signature:
 *   simulateTimestep({ state, interval, components, options })
 *
 * Returns: { nextState, outputs, diagnostics }
 */

export function simulateTimestep({ state = {}, interval, components = {} }) {
  if (!interval || !interval.start || !interval.end) {
    throw new Error('interval with start and end required');
  }

  // normalize inputs
  const vals = interval.values || {};
  const expectedProductionPower = Number(
    vals.expectedProductionPower ?? vals.expectedProduction ?? 0
  );
  const expectedConsumptionPower = Number(
    vals.expectedConsumptionPower ?? vals.expectedConsumption ?? 0
  );
  const targetGridPoint = Number(vals.targetGridPoint ?? vals.targetGrid ?? 0);
  const prematureExportPower = Number(vals.prematureExportPower ?? 0);
  const extraConsumptionPower = Number(
    vals.extraConsumptionPower ?? vals.extraConsumption ?? 0
  );
  const extraConsumptionEndsAt = vals.extraConsumptionEndsAt
    ? new Date(vals.extraConsumptionEndsAt)
    : undefined;

  const importPrice = vals.importPrice ?? null;
  const exportPrice = vals.exportPrice ?? null;

  const batterySpec = components.battery || {};
  const gridSpec = components.grid || {};
  const CAPACITY = Number(batterySpec.capacity_kwh ?? 10);
  const MAX_CHARGE = Number(batterySpec.max_charge_power_kw ?? Infinity);
  const MAX_DISCHARGE = Number(batterySpec.max_discharge_power_kw ?? Infinity);
  const MIN_SOC = Number(batterySpec.min_soc_kwh ?? 0);

  const MAX_EXPORT = Number(
    gridSpec.max_export_power_kw ?? gridSpec.KW_MAX_EXPORT_POWER ?? Infinity
  );

  let socStart = Number(
    state.battery_soc_kwh ??
      state.batteryChargeAtStart ??
      batterySpec.soc_kwh ??
      0
  );

  // helpers
  const toHours = (ms) => ms / 3600000;

  function getPowerBalance(iv) {
    let powerBalance =
      expectedProductionPower - expectedConsumptionPower + targetGridPoint;
    if (prematureExportPower) powerBalance -= prematureExportPower;
    if (
      extraConsumptionPower &&
      extraConsumptionEndsAt &&
      new Date(iv.start) < extraConsumptionEndsAt
    ) {
      powerBalance -= extraConsumptionPower;
    } else if (extraConsumptionPower && !extraConsumptionEndsAt) {
      // no end specified -> assume it applies
      powerBalance -= extraConsumptionPower;
    }
    return powerBalance;
  }

  function getConstrainedPowerBalance(powerBalance) {
    if (Number.isFinite(MAX_EXPORT)) return Math.min(powerBalance, MAX_EXPORT);
    return powerBalance;
  }

  function limitToBatteryCharge(powerBalance) {
    if (powerBalance > MAX_CHARGE) return MAX_CHARGE;
    if (powerBalance < -MAX_DISCHARGE) return -MAX_DISCHARGE;
    return powerBalance;
  }

  function getExtraConsumedEnergyForInterval(iv) {
    if (!extraConsumptionPower || extraConsumptionPower === 0) return 0;
    const ivStart = new Date(iv.start).getTime();
    const ivEnd = new Date(iv.end).getTime();
    if (!extraConsumptionEndsAt)
      return (extraConsumptionPower * (ivEnd - ivStart)) / 3600000;
    const extraEnd = extraConsumptionEndsAt.getTime();
    if (extraEnd <= ivStart) return 0;
    const effectiveEnd = Math.min(ivEnd, extraEnd);
    return (extraConsumptionPower * (effectiveEnd - ivStart)) / 3600000;
  }

  // recursive simulation of potentially-split interval
  function simulateInterval(iv, batteryChargeAtStart, continueDeeper = true) {
    const ivStart = new Date(iv.start);
    const ivEnd = new Date(iv.end);
    const ivDurationH = toHours(ivEnd.getTime() - ivStart.getTime());

    const unconstrainedPowerBalance = getPowerBalance(iv);
    const constrainedPowerBalance = getConstrainedPowerBalance(
      unconstrainedPowerBalance
    );

    // initial missedProduction estimate (will be overwritten later based on limitedBatteryChargePower)
    let missedProduction =
      Math.min(
        expectedProductionPower,
        Math.max(0, unconstrainedPowerBalance - constrainedPowerBalance)
      ) * ivDurationH;

    const extraConsumed = getExtraConsumedEnergyForInterval(iv);

    // quick full/empty short-circuits
    if (unconstrainedPowerBalance > 0 && batteryChargeAtStart >= CAPACITY) {
      // charging but battery already full
      const exportedEnergy = constrainedPowerBalance * ivDurationH;
      return {
        batteryChargeAtEnd: CAPACITY,
        exportedEnergy,
        importedEnergy: 0,
        missedProduction,
        extraConsumedEnergy: extraConsumed,
      };
    }

    if (unconstrainedPowerBalance < 0 && batteryChargeAtStart <= MIN_SOC) {
      // discharging but battery empty (or <= min)
      const importedEnergy = -unconstrainedPowerBalance * ivDurationH;
      return {
        batteryChargeAtEnd: MIN_SOC,
        exportedEnergy: 0,
        importedEnergy,
        missedProduction: 0,
        extraConsumedEnergy: extraConsumed,
      };
    }

    // limit battery power
    const limitedBatteryChargePower = limitToBatteryCharge(
      unconstrainedPowerBalance
    );

    // recompute missedProduction considering battery taking limitedBatteryChargePower
    missedProduction =
      Math.min(
        expectedProductionPower,
        Math.max(
          0,
          unconstrainedPowerBalance -
            limitedBatteryChargePower -
            constrainedPowerBalance
        )
      ) * ivDurationH;

    if (limitedBatteryChargePower === 0) {
      // battery does not change
      return {
        batteryChargeAtEnd: batteryChargeAtStart,
        exportedEnergy: 0,
        importedEnergy: 0,
        missedProduction,
        extraConsumedEnergy: extraConsumed,
      };
    }

    // energy change if battery charged/discharged at limited power for full iv
    const realBatteryEnergyChange = limitedBatteryChargePower * ivDurationH;
    const unconstrainedBatteryChargeAtEnd =
      batteryChargeAtStart + realBatteryEnergyChange;

    // battery would fill during interval
    if (unconstrainedBatteryChargeAtEnd >= CAPACITY) {
      if (!continueDeeper) {
        // approximate: clamp and attribute remainder to export
        let exportedEnergy = 0;
        if (batteryChargeAtStart < CAPACITY) {
          exportedEnergy =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            ivDurationH;
        } else {
          exportedEnergy = constrainedPowerBalance * ivDurationH;
        }
        return {
          batteryChargeAtEnd: CAPACITY,
          exportedEnergy,
          importedEnergy: 0,
          missedProduction,
          extraConsumedEnergy: extraConsumed,
        };
      }

      const missingChargeOnStart = CAPACITY - batteryChargeAtStart;
      // time (hours) until full at limitedBatteryChargePower kW => hoursToFull = missingChargeOnStart / limitedBatteryChargePower
      const hoursToFull = missingChargeOnStart / limitedBatteryChargePower;
      const msToFull = hoursToFull * 3600000;
      const timePointWhenFull = new Date(ivStart.getTime() + msToFull);

      // split into firstInterval [start, timePointWhenFull] and secondInterval [timePointWhenFull, end]
      const firstIv = { start: ivStart, end: timePointWhenFull };
      const secondIv = { start: timePointWhenFull, end: ivEnd };

      const first = simulateInterval(firstIv, batteryChargeAtStart, false);
      const second = simulateInterval(
        secondIv,
        first.batteryChargeAtEnd,
        false
      );

      return {
        batteryChargeAtEnd: second.batteryChargeAtEnd,
        exportedEnergy: first.exportedEnergy + second.exportedEnergy,
        importedEnergy: first.importedEnergy + second.importedEnergy,
        missedProduction: first.missedProduction + second.missedProduction,
        extraConsumedEnergy:
          first.extraConsumedEnergy + second.extraConsumedEnergy,
      };
    }

    // battery would empty during the interval
    if (unconstrainedBatteryChargeAtEnd <= MIN_SOC) {
      if (!continueDeeper) {
        let importedEnergy = 0;
        if (batteryChargeAtStart > MIN_SOC) {
          importedEnergy =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            ivDurationH;
        } else {
          importedEnergy = 0 - unconstrainedBatteryChargeAtEnd;
        }
        return {
          batteryChargeAtEnd: MIN_SOC,
          exportedEnergy: 0,
          importedEnergy,
          missedProduction,
          extraConsumedEnergy: extraConsumed,
        };
      }

      const hoursToEmpty =
        (batteryChargeAtStart - MIN_SOC) / -limitedBatteryChargePower;
      const msToEmpty = hoursToEmpty * 3600000;
      const timePointWhenEmpty = new Date(ivStart.getTime() + msToEmpty);

      const firstIv = { start: ivStart, end: timePointWhenEmpty };
      const secondIv = { start: timePointWhenEmpty, end: ivEnd };

      const first = simulateInterval(firstIv, batteryChargeAtStart, false);
      const second = simulateInterval(
        secondIv,
        first.batteryChargeAtEnd,
        false
      );

      return {
        batteryChargeAtEnd: second.batteryChargeAtEnd,
        exportedEnergy: first.exportedEnergy + second.exportedEnergy,
        importedEnergy: first.importedEnergy + second.importedEnergy,
        missedProduction: first.missedProduction + second.missedProduction,
        extraConsumedEnergy:
          first.extraConsumedEnergy + second.extraConsumedEnergy,
      };
    }

    // battery stays within bounds for full interval
    const batteryChargeAtEnd = unconstrainedBatteryChargeAtEnd;

    // determine export/import resulting from targetGridPoint when battery handles charging/discharging
    const exportedEnergy = Math.max(0, -targetGridPoint) * ivDurationH;
    const importedEnergy = Math.max(0, targetGridPoint) * ivDurationH;

    return {
      batteryChargeAtEnd,
      exportedEnergy,
      importedEnergy,
      missedProduction,
      extraConsumedEnergy: extraConsumed,
    };
  }

  // simulate the full (possibly-split) interval
  const result = simulateInterval(
    { start: new Date(interval.start), end: new Date(interval.end) },
    socStart,
    true
  );

  // prepare outputs
  const outputs = {
    start: interval.start,
    end: interval.end,
    durationMs:
      new Date(interval.end).getTime() - new Date(interval.start).getTime(),
    exportedEnergy: Number((result.exportedEnergy ?? 0).toFixed(12)),
    importedEnergy: Number((result.importedEnergy ?? 0).toFixed(12)),
    missedProduction: Number((result.missedProduction ?? 0).toFixed(12)),
    extraConsumedEnergy: Number((result.extraConsumedEnergy ?? 0).toFixed(12)),
    battery_charge_kwh: Number(
      result.batteryChargeAtEnd > socStart
        ? (result.batteryChargeAtEnd - socStart).toFixed(12)
        : 0
    ),
    battery_discharge_kwh: Number(
      result.batteryChargeAtEnd < socStart
        ? (socStart - result.batteryChargeAtEnd).toFixed(12)
        : 0
    ),
    battery_soc_kwh: Number(
      (result.batteryChargeAtEnd ?? socStart).toFixed(12)
    ),
    importPrice,
    exportPrice,
    cost: Number(
      ((result.importedEnergy ?? 0) * (importPrice ?? 0)).toFixed(12)
    ),
    revenue: Number(
      ((result.exportedEnergy ?? 0) * (exportPrice ?? 0)).toFixed(12)
    ),
  };

  const diagnostics = {
    CAPACITY,
    MAX_CHARGE,
    MAX_DISCHARGE,
    MAX_EXPORT,
    socStart,
    result,
  };

  const nextState = { battery_soc_kwh: outputs.battery_soc_kwh };

  return { nextState, outputs, diagnostics };
}
