import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';
import { getTimestepDurationHours } from '../timestep-duration.js';

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46;
const DEFAULT_PRIORITY = 50;

/**
 * Distributes the export that would otherwise happen during negative-price
 * periods across all earlier non-negative-price timesteps.
 *
 * The strategy intentionally does not optimize for the highest prices. It
 * simply spreads the required export energy across the available earlier
 * timesteps, subject to the configured maximum export power.
 *
 * The strategy only creates a Plan. It never changes the TimeSeries.
 */
export class DistributedNegativePriceExportStrategy extends Strategy {
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
    return 'distributed-negative-price-export';
  }

  createPlan(timeSeries, options = {}) {
    if (!Array.isArray(timeSeries))
      throw new Error('timeSeries must be an array');

    const maxExportPowerKw = options.maxExportPowerKw ?? this.maxExportPowerKw;
    const priority = options.priority ?? this.priority;
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw');
    validatePriority(priority);

    let requiredExportEnergyKwh = 0;

    for (const timestep of timeSeries) {
      const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);
      if (spotPerKwh >= 0) continue;

      const start = new Date(timestep.start);
      const end = new Date(timestep.end);
      const durationHours = getTimestepDurationHours(start, end);
      const gridTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
      const gridExportKwh = Number(timestep.grid?.exportKwh ?? 0);
      const allowedExportEnergyKwh =
        Math.max(0, -gridTargetPowerKw) * durationHours;

      requiredExportEnergyKwh += Math.max(
        0,
        gridExportKwh - allowedExportEnergyKwh
      );
    }

    if (requiredExportEnergyKwh <= 0) {
      return createResult(this.id, [], 0);
    }

    const candidates = timeSeries
      .filter((timestep) => Number(timestep.grid?.spotPerKwh ?? 0) >= 0)
      .map((timestep) => {
        const start = new Date(timestep.start);
        const end = new Date(timestep.end);
        const durationHours = getTimestepDurationHours(start, end);
        return { timestep, start, end, durationHours };
      });

    if (candidates.length === 0) {
      return createResult(this.id, [], requiredExportEnergyKwh);
    }

    // Spread the required energy evenly over all earlier candidates. If the
    // negative-price period is at the beginning, that period is not a valid
    // candidate. A candidate after the negative-price period is also excluded.
    const firstNegativeStart = timeSeries.reduce((earliest, timestep) => {
      if (Number(timestep.grid?.spotPerKwh ?? 0) >= 0) return earliest;
      const start = new Date(timestep.start);
      return earliest === null || start < earliest ? start : earliest;
    }, null);

    const earlierCandidates = candidates.filter(
      ({ start }) => firstNegativeStart === null || start < firstNegativeStart
    );

    if (earlierCandidates.length === 0) {
      return createResult(this.id, [], requiredExportEnergyKwh);
    }

    let remainingExportEnergyKwh = requiredExportEnergyKwh;
    const proposals = [];

    // Iterate chronologically so the resulting actions are naturally ordered.
    for (let index = 0; index < earlierCandidates.length; index += 1) {
      const candidate = earlierCandidates[index];
      const remainingCandidates = earlierCandidates.length - index;
      const desiredEnergyKwh = remainingExportEnergyKwh / remainingCandidates;
      const maxEnergyKwh =
        maxExportPowerKw * candidate.durationHours;
      const actionEnergyKwh = Math.min(desiredEnergyKwh, maxEnergyKwh);

      if (actionEnergyKwh <= 0) continue;

      const actionPowerKw = actionEnergyKwh / candidate.durationHours;
      const gridTargetPowerKw = Number(
        candidate.timestep.grid?.targetPowerKw ?? 0
      );

      proposals.push(
        new ActionProposal({
          strategyId: this.id,
          priority,
          action: new Action({
            type: 'set-grid-target',
            start: candidate.start,
            end: candidate.end,
            gridTargetPowerKw: gridTargetPowerKw - actionPowerKw,
            reason: 'AVOID_NEGATIVE_PRICE_EXPORT_DISTRIBUTED',
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

    return createResult(this.id, proposals, remainingExportEnergyKwh);
  }
}

function createResult(strategyId, proposals, remainingExportEnergyKwh) {
  return {
    strategyId,
    proposals,
    remainingExportEnergyKwh,
    totalPlannedExportEnergyKwh: proposals.reduce(
      (sum, proposal) =>
        sum + (proposal.action.expectedBenefit?.estimatedEnergyKwh ?? 0),
      0
    ),
  };
}

function validatePositiveOrZero(value, name) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a non-negative finite number`);
}

function validatePriority(value) {
  if (!Number.isFinite(value))
    throw new Error('priority must be a finite number');
}
