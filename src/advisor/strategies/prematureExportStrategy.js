import { Strategy } from '../strategy.js';

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46;
const DEFAULT_INTERVAL_MINUTES = 15;

/**
 * Plans premature exports so that energy that would otherwise be exported
 * during negative-price intervals can be exported during earlier intervals
 * with a non-negative price.
 */
export class PrematureExportStrategy extends Strategy {
  constructor({
    maxExportPowerKw = DEFAULT_MAX_EXPORT_POWER_KW,
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
  } = {}) {
    super();

    if (!Number.isFinite(maxExportPowerKw) || maxExportPowerKw < 0) {
      throw new Error('maxExportPowerKw must be a non-negative finite number');
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      throw new Error('intervalMinutes must be a positive finite number');
    }

    this.maxExportPowerKw = maxExportPowerKw;
    this.intervalMinutes = intervalMinutes;
  }

  run(simulationIntervals, options = {}) {
    if (!Array.isArray(simulationIntervals)) {
      throw new Error('simulationIntervals must be an array');
    }

    const maxExportPowerKw = options.maxExportPowerKw ?? this.maxExportPowerKw;
    const intervalMinutes = options.intervalMinutes ?? this.intervalMinutes;

    if (!Number.isFinite(maxExportPowerKw) || maxExportPowerKw < 0) {
      throw new Error('maxExportPowerKw must be a non-negative finite number');
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      throw new Error('intervalMinutes must be a positive finite number');
    }

    const intervals = simulationIntervals.map((interval) => ({
      ...interval,
      values: interval.values ? { ...interval.values } : interval.values,
    }));

    let remainingEnergyToExport = 0;
    let totalPlannedPrematureExports = 0;
    const intervalHours = intervalMinutes / 60;

    for (let index = intervals.length - 1; index >= 0; index--) {
      const currentFrame = intervals[index];
      const electricityPrice = getValue(
        currentFrame,
        'electricityPrice',
        'importPrice'
      );
      const targetGridPoint = Number(
        getValue(currentFrame, 'targetGridPoint', 'gridTarget') ?? 0
      );
      const exportedEnergy = Number(
        getValue(currentFrame, 'exportedEnergy', 'grid_export_kwh') ?? 0
      );

      if (electricityPrice < 0) {
        // Keep the configured target grid export and move only the excess
        // into an earlier, non-negative-price interval.
        const allowedEnergyToExport = -targetGridPoint * intervalHours;
        remainingEnergyToExport += Math.max(
          0,
          exportedEnergy - allowedEnergyToExport
        );

        setValue(currentFrame, 'prematureExportPower', 0);
        setValue(currentFrame, 'extraEnergyToGetRidOf', 0);
      } else if (remainingEnergyToExport > 0) {
        const additionalExportPower = maxExportPowerKw;
        const energyThisInterval = additionalExportPower * intervalHours;
        const extraEnergyToGetRidOf = Math.min(
          remainingEnergyToExport,
          energyThisInterval
        );

        setValue(currentFrame, 'additionalExportPower', additionalExportPower);
        setValue(currentFrame, 'extraEnergyToGetRidOf', extraEnergyToGetRidOf);

        // Preserve the semantics of the existing algorithm: this field is
        // a power value, even though the remaining amount is tracked in kWh.
        setValue(
          currentFrame,
          'prematureExportPower',
          Math.min(remainingEnergyToExport, additionalExportPower)
        );

        remainingEnergyToExport = Math.max(
          0,
          remainingEnergyToExport - extraEnergyToGetRidOf
        );
        totalPlannedPrematureExports += extraEnergyToGetRidOf;
      } else {
        setValue(currentFrame, 'prematureExportPower', 0);
        setValue(currentFrame, 'extraEnergyToGetRidOf', 0);
      }

      setValue(
        currentFrame,
        'remainingEnergyToExport',
        remainingEnergyToExport
      );
    }

    return {
      simulationIntervals: intervals,
      remainingEnergyToExport,
      totalPlannedPrematureExports,
    };
  }
}

function getValue(frame, directProperty, valueProperty) {
  if (frame[directProperty] !== undefined) {
    return frame[directProperty];
  }
  if (frame[valueProperty] !== undefined) {
    return frame[valueProperty];
  }
  return frame.values?.[valueProperty];
}

function setValue(frame, property, value) {
  frame[property] = value;
  if (frame.values) {
    frame.values[property] = value;
  }
}
