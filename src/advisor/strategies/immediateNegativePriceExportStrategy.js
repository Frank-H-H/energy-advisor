import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';
import { getTimestepDurationHours } from '../timestep-duration.js';

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46;
const DEFAULT_PRIORITY = 50;

/**
 * Plans exports immediately before negative-price periods so that energy
 * that would otherwise be exported during negative-price periods can be
 * exported in the nearest earlier periods.
 *
 * The strategy only creates a Plan. It never changes the TimeSeries.
 */
export class ImmediateNegativePriceExportStrategy extends Strategy {
  constructor({
    maxExportPowerKw = DEFAULT_MAX_EXPORT_POWER_KW,
    priority = DEFAULT_PRIORITY,
  } = {}) {
    super();
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw');
    validatePriority(priority);
    this.maxExportPowerKw = maxExportPowerKw;
    this.priority = priority;
  }

  get id() {
    return 'immediate-negative-price-export';
  }

  createPlan(timeSeries, options = {}) {
    if (!Array.isArray(timeSeries))
      throw new Error('timeSeries must be an array');

    const maxExportPowerKw = options.maxExportPowerKw ?? this.maxExportPowerKw;
    const priority = options.priority ?? this.priority;
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw');
    validatePriority(priority);

    let remainingExportEnergyKwh = 0;
    const proposals = [];

    for (let index = timeSeries.length - 1; index >= 0; index -= 1) {
      const timestep = timeSeries[index];
      const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);
      const gridTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
      const gridExportKwh = Number(timestep.grid?.exportKwh ?? 0);

      const start = new Date(timestep.start);
      const end = new Date(timestep.end);
      const durationHours = getTimestepDurationHours(start, end);

      if (spotPerKwh < 0) {
        // gridTargetPowerKw < 0 means export.
        const allowedExportEnergyKwh =
          Math.max(0, -gridTargetPowerKw) * durationHours;
        remainingExportEnergyKwh += Math.max(
          0,
          gridExportKwh - allowedExportEnergyKwh
        );
        continue;
      }

      if (remainingExportEnergyKwh <= 0) continue;

      const actionPowerKw = Math.min(
        maxExportPowerKw,
        remainingExportEnergyKwh / durationHours
      );
      const actionEnergyKwh = Math.min(
        remainingExportEnergyKwh,
        actionPowerKw * durationHours
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

function validatePriority(value) {
  if (!Number.isFinite(value))
    throw new Error('priority must be a finite number');
}
