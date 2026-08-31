// src/simulation/step.js

/**
 * Simulate a single timestep (interval).
 *
 * This implementation follows the behavior of the Node-RED "SimulateSingleFrame" subflow:
 * - inputs are power values (kW) and converted to energy (kWh) using interval duration
 * - respects battery power limits and SOC bounds
 * - splits the interval into sub-parts when the battery fills or empties during the interval
 * - computes exportedEnergyKwh, importedEnergyKwh, missedProductionEnergyKwh, extraConsumedEnergyKwh and resulting SOC
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
  const expectedProductionPowerKw = Number(
    vals.expectedProductionPowerKw ?? 0
  );
  const expectedConsumptionPowerKw = Number(
    vals.expectedConsumptionPowerKw ?? 0
  );
  const gridTargetPowerKw = Number(vals.gridTargetPowerKw ?? 0);
  const prematureExportPowerKw = Number(vals.prematureExportPowerKw ?? 0);
  const extraConsumptionPowerKw = Number(
    vals.extraConsumptionPowerKw ?? vals.extraConsumption ?? 0
  );
  const extraConsumptionEndsAt = vals.extraConsumptionEndsAt
    ? new Date(vals.extraConsumptionEndsAt)
    : undefined;

  const importPricePerKwh = vals.importPricePerKwh ?? null;
  const exportPricePerKwh = vals.exportPricePerKwh ?? null;

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
      state.batteryEnergyAtStartKwh ??
      batterySpec.soc_kwh ??
      0
  );

  // helpers
  const toHours = (ms) => ms / 3600000;

  function getPowerBalance(iv) {
    let powerBalance =
      expectedProductionPowerKw - expectedConsumptionPowerKw + gridTargetPowerKw;
    if (prematureExportPowerKw) powerBalance -= prematureExportPowerKw;
    if (
      extraConsumptionPowerKw &&
      extraConsumptionEndsAt &&
      new Date(iv.start) < extraConsumptionEndsAt
    ) {
      powerBalance -= extraConsumptionPowerKw;
    } else if (extraConsumptionPowerKw && !extraConsumptionEndsAt) {
      // no end specified -> assume it applies
      powerBalance -= extraConsumptionPowerKw;
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
    if (!extraConsumptionPowerKw || extraConsumptionPowerKw === 0) return 0;
    const ivStart = new Date(iv.start).getTime();
    const ivEnd = new Date(iv.end).getTime();
    if (!extraConsumptionEndsAt)
      return (extraConsumptionPowerKw * (ivEnd - ivStart)) / 3600000;
    const extraEnd = extraConsumptionEndsAt.getTime();
    if (extraEnd <= ivStart) return 0;
    const effectiveEnd = Math.min(ivEnd, extraEnd);
    return (extraConsumptionPowerKw * (effectiveEnd - ivStart)) / 3600000;
  }

  // recursive simulation of potentially-split interval
  function simulateInterval(iv, batteryEnergyAtStartKwh, continueDeeper = true) {
    const ivStart = new Date(iv.start);
    const ivEnd = new Date(iv.end);
    const ivDurationH = toHours(ivEnd.getTime() - ivStart.getTime());

    const unconstrainedPowerBalance = getPowerBalance(iv);
    const constrainedPowerBalance = getConstrainedPowerBalance(
      unconstrainedPowerBalance
    );

    // initial missedProductionEnergyKwh estimate (will be overwritten later based on limitedBatteryChargePower)
    let missedProductionEnergyKwh =
      Math.min(
        expectedProductionPowerKw,
        Math.max(0, unconstrainedPowerBalance - constrainedPowerBalance)
      ) * ivDurationH;

    const extraConsumed = getExtraConsumedEnergyForInterval(iv);

    // quick full/empty short-circuits
    if (unconstrainedPowerBalance > 0 && batteryEnergyAtStartKwh >= CAPACITY) {
      // charging but battery already full
      const exportedEnergyKwh = constrainedPowerBalance * ivDurationH;
      return {
        batteryEnergyAtEndKwh: CAPACITY,
        exportedEnergyKwh,
        importedEnergyKwh: 0,
        missedProductionEnergyKwh,
        extraConsumedEnergyKwh: extraConsumed,
      };
    }

    if (unconstrainedPowerBalance < 0 && batteryEnergyAtStartKwh <= MIN_SOC) {
      // discharging but battery empty (or <= min)
      const importedEnergyKwh = -unconstrainedPowerBalance * ivDurationH;
      return {
        batteryEnergyAtEndKwh: MIN_SOC,
        exportedEnergyKwh: 0,
        importedEnergyKwh,
        missedProductionEnergyKwh: 0,
        extraConsumedEnergyKwh: extraConsumed,
      };
    }

    // limit battery power
    const limitedBatteryChargePower = limitToBatteryCharge(
      unconstrainedPowerBalance
    );

    // recompute missedProductionEnergyKwh considering battery taking limitedBatteryChargePower
    missedProductionEnergyKwh =
      Math.min(
        expectedProductionPowerKw,
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
        batteryEnergyAtEndKwh: batteryEnergyAtStartKwh,
        exportedEnergyKwh: 0,
        importedEnergyKwh: 0,
        missedProductionEnergyKwh,
        extraConsumedEnergyKwh: extraConsumed,
      };
    }

    // energy change if battery charged/discharged at limited power for full iv
    const realBatteryEnergyChange = limitedBatteryChargePower * ivDurationH;
    const unconstrainedBatteryChargeAtEnd =
      batteryEnergyAtStartKwh + realBatteryEnergyChange;

    // battery would fill during interval
    if (unconstrainedBatteryChargeAtEnd >= CAPACITY) {
      if (!continueDeeper) {
        // approximate: clamp and attribute remainder to export
        let exportedEnergyKwh = 0;
        if (batteryEnergyAtStartKwh < CAPACITY) {
          exportedEnergyKwh =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            ivDurationH;
        } else {
          exportedEnergyKwh = constrainedPowerBalance * ivDurationH;
        }
        return {
          batteryEnergyAtEndKwh: CAPACITY,
          exportedEnergyKwh,
          importedEnergyKwh: 0,
          missedProductionEnergyKwh,
          extraConsumedEnergyKwh: extraConsumed,
        };
      }

      const missingChargeOnStart = CAPACITY - batteryEnergyAtStartKwh;
      // time (hours) until full at limitedBatteryChargePower kW => hoursToFull = missingChargeOnStart / limitedBatteryChargePower
      const hoursToFull = missingChargeOnStart / limitedBatteryChargePower;
      const msToFull = hoursToFull * 3600000;
      const timePointWhenFull = new Date(ivStart.getTime() + msToFull);

      // split into firstInterval [start, timePointWhenFull] and secondInterval [timePointWhenFull, end]
      const firstIv = { start: ivStart, end: timePointWhenFull };
      const secondIv = { start: timePointWhenFull, end: ivEnd };

      const first = simulateInterval(firstIv, batteryEnergyAtStartKwh, false);
      const second = simulateInterval(
        secondIv,
        first.batteryEnergyAtEndKwh,
        false
      );

      return {
        batteryEnergyAtEndKwh: second.batteryEnergyAtEndKwh,
        exportedEnergyKwh: first.exportedEnergyKwh + second.exportedEnergyKwh,
        importedEnergyKwh: first.importedEnergyKwh + second.importedEnergyKwh,
        missedProductionEnergyKwh: first.missedProductionEnergyKwh + second.missedProductionEnergyKwh,
        extraConsumedEnergyKwh:
          first.extraConsumedEnergyKwh + second.extraConsumedEnergyKwh,
      };
    }

    // battery would empty during the interval
    if (unconstrainedBatteryChargeAtEnd <= MIN_SOC) {
      if (!continueDeeper) {
        let importedEnergyKwh = 0;
        if (batteryEnergyAtStartKwh > MIN_SOC) {
          importedEnergyKwh =
            Math.max(0, unconstrainedPowerBalance - limitedBatteryChargePower) *
            ivDurationH;
        } else {
          importedEnergyKwh = 0 - unconstrainedBatteryChargeAtEnd;
        }
        return {
          batteryEnergyAtEndKwh: MIN_SOC,
          exportedEnergyKwh: 0,
          importedEnergyKwh,
          missedProductionEnergyKwh,
          extraConsumedEnergyKwh: extraConsumed,
        };
      }

      const hoursToEmpty =
        (batteryEnergyAtStartKwh - MIN_SOC) / -limitedBatteryChargePower;
      const msToEmpty = hoursToEmpty * 3600000;
      const timePointWhenEmpty = new Date(ivStart.getTime() + msToEmpty);

      const firstIv = { start: ivStart, end: timePointWhenEmpty };
      const secondIv = { start: timePointWhenEmpty, end: ivEnd };

      const first = simulateInterval(firstIv, batteryEnergyAtStartKwh, false);
      const second = simulateInterval(
        secondIv,
        first.batteryEnergyAtEndKwh,
        false
      );

      return {
        batteryEnergyAtEndKwh: second.batteryEnergyAtEndKwh,
        exportedEnergyKwh: first.exportedEnergyKwh + second.exportedEnergyKwh,
        importedEnergyKwh: first.importedEnergyKwh + second.importedEnergyKwh,
        missedProductionEnergyKwh: first.missedProductionEnergyKwh + second.missedProductionEnergyKwh,
        extraConsumedEnergyKwh:
          first.extraConsumedEnergyKwh + second.extraConsumedEnergyKwh,
      };
    }

    // battery stays within bounds for full interval
    const batteryEnergyAtEndKwh = unconstrainedBatteryChargeAtEnd;

    // determine export/import resulting from gridTargetPowerKw when battery handles charging/discharging
    const exportedEnergyKwh = Math.max(0, -gridTargetPowerKw) * ivDurationH;
    const importedEnergyKwh = Math.max(0, gridTargetPowerKw) * ivDurationH;

    return {
      batteryEnergyAtEndKwh,
      exportedEnergyKwh,
      importedEnergyKwh,
      missedProductionEnergyKwh,
      extraConsumedEnergyKwh: extraConsumed,
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
    exportedEnergyKwh: Number((result.exportedEnergyKwh ?? 0).toFixed(12)),
    importedEnergyKwh: Number((result.importedEnergyKwh ?? 0).toFixed(12)),
    missedProductionEnergyKwh: Number((result.missedProductionEnergyKwh ?? 0).toFixed(12)),
    extraConsumedEnergyKwh: Number((result.extraConsumedEnergyKwh ?? 0).toFixed(12)),
    battery_charge_kwh: Number(
      result.batteryEnergyAtEndKwh > socStart
        ? (result.batteryEnergyAtEndKwh - socStart).toFixed(12)
        : 0
    ),
    battery_discharge_kwh: Number(
      result.batteryEnergyAtEndKwh < socStart
        ? (socStart - result.batteryEnergyAtEndKwh).toFixed(12)
        : 0
    ),
    battery_soc_kwh: Number(
      (result.batteryEnergyAtEndKwh ?? socStart).toFixed(12)
    ),
    importPricePerKwh,
    exportPricePerKwh,
    cost: Number(
      ((result.importedEnergyKwh ?? 0) * (importPricePerKwh ?? 0)).toFixed(12)
    ),
    revenue: Number(
      ((result.exportedEnergyKwh ?? 0) * (exportPricePerKwh ?? 0)).toFixed(12)
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
