import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46;
const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_PRIORITY = 50;

/**
 * Plans premature exports so that energy that would otherwise be exported
 * during negative-price periods can be exported during earlier periods with
 * a non-negative import price.
 *
 * The strategy only creates a Plan. It never changes the TimeSeries.
 */
export class PrematureExportStrategy extends Strategy {
  constructor({
    maxExportPowerKw = DEFAULT_MAX_EXPORT_POWER_KW,
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    priority = DEFAULT_PRIORITY,
  } = {}) {
    super();
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw');
    validatePositive(intervalMinutes, 'intervalMinutes');
    validatePriority(priority);
    this.maxExportPowerKw = maxExportPowerKw;
    this.intervalMinutes = intervalMinutes;
    this.priority = priority;
  }

  get id() {
    return 'premature-export';
  }

  createPlan(timeSeries, options = {}) {
    if (!Array.isArray(timeSeries))
      throw new Error('timeSeries must be an array');

    const maxExportPowerKw = options.maxExportPowerKw ?? this.maxExportPowerKw;
    const intervalMinutes = options.intervalMinutes ?? this.intervalMinutes;
    const priority = options.priority ?? this.priority;
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw');
    validatePositive(intervalMinutes, 'intervalMinutes');
    validatePriority(priority);

    let remainingExportEnergyKwh = 0;
    const proposals = [];

    for (let index = timeSeries.length - 1; index >= 0; index -= 1) {
      const timestep = timeSeries[index];
      const values = timestep.values ?? {};
      const importPricePerKwh = Number(
        values.importPricePerKwh ??
          values.importPricePerKwh ??
          timestep.importPricePerKwh ??
          timestep.importPricePerKwh ??
          0
      );
      const gridTargetPowerKw = Number(
        values.gridTargetPowerKw ??
          timestep.gridTargetPowerKw ??
          values.gridTargetPowerKw ??
          timestep.gridTargetPowerKw ??
          0
      );
      const exportedEnergyKwh = Number(
        values.exportedEnergyKwh ??
          values.grid_export_kwh ??
          timestep.exportedEnergyKwh ??
          timestep.exportedEnergyKwh ??
          0
      );

      const start = new Date(timestep.start);
      const end = new Date(timestep.end);
      const durationHours = (end.getTime() - start.getTime()) / 3600000;
      const effectiveDurationHours =
        durationHours > 0 ? durationHours : intervalMinutes / 60;

      if (importPricePerKwh < 0) {
        // gridTargetPowerKw < 0 means export.
        const allowedExportEnergyKwh =
          Math.max(0, -gridTargetPowerKw) * effectiveDurationHours;
        remainingExportEnergyKwh += Math.max(
          0,
          exportedEnergyKwh - allowedExportEnergyKwh
        );
        continue;
      }

      if (remainingExportEnergyKwh <= 0) continue;

      const actionPowerKw = Math.min(
        maxExportPowerKw,
        remainingExportEnergyKwh / effectiveDurationHours
      );
      const actionEnergyKwh = Math.min(
        remainingExportEnergyKwh,
        actionPowerKw * effectiveDurationHours
      );
      if (actionEnergyKwh <= 0) continue;

      proposals.push(
        new ActionProposal({
          strategyId: this.id,
          priority,
          action: new Action({
            type: 'set-grid-target',
            start,
            end,
            // Export is negative. The action adds export to the existing target.
            gridTargetPowerKw: gridTargetPowerKw - actionPowerKw,
            reason: 'AVOID_NEGATIVE_PRICE_EXPORT',
            expectedBenefit: {
              type: 'avoided-negative-price-export',
              estimatedEnergyKwh: actionEnergyKwh,
            },
            confidence: 1,
          }),
        })
      );

      remainingExportEnergyKwh = Math.max(
        0,
        remainingExportEnergyKwh - actionEnergyKwh
      );
    }

    return {
      strategyId: this.id,
      proposals,
      remainingExportEnergyKwh,
      totalPlannedExportEnergyKwh: proposals.reduce(
        (sum, proposal) =>
          sum + (proposal.action.expectedBenefit?.estimatedEnergyKwh ?? 0),
        0
      ),
    };
  }
}

function validatePositiveOrZero(value, name) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a non-negative finite number`);
}

function validatePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive finite number`);
}

function validatePriority(value) {
  if (!Number.isFinite(value))
    throw new Error('priority must be a finite number');
}
