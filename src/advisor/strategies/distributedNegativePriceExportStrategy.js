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
 * Applied per timestep by the AdvisorEngine: on every candidate timestep
 * (non-negative price, before the first negative-price timestep) it plans
 * an even share of the still remaining surplus. Candidates, their count
 * and the total surplus are precomputed once per run, which reproduces the
 * previous whole-series distribution exactly.
 *
 * The strategy only creates proposals. It never changes the timestep it
 * receives and never executes an action.
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

  planTimestep(timestep, context = {}) {
    const { series, index, state } = context;
    if (!Array.isArray(series) || !Number.isInteger(index) || !state) {
      throw new Error(
        'planTimestep() requires a context with series, index and state'
      );
    }
    initializeState(state, series);

    if (!state.candidateIndices.has(index)) return [];

    state.candidatesSeen += 1;

    const remainingCandidates =
      state.candidateIndices.size - state.candidatesSeen;
    const remainingExportEnergyKwh =
      state.totalRequiredKwh - state.plannedKwh;
    if (remainingExportEnergyKwh <= 0 || remainingCandidates < 0) return [];

    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const gridTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);

    const desiredEnergyKwh =
      remainingExportEnergyKwh / (remainingCandidates + 1);
    const desiredPowerKw = Math.min(
      desiredEnergyKwh / durationHours,
      this.maxExportPowerKw
    );
    // Never exceed the configured maximum export power in total, even when
    // strategies applied earlier in the timestep already added export.
    const newTargetPowerKw = Math.max(
      gridTargetPowerKw - desiredPowerKw,
      -this.maxExportPowerKw
    );
    const actionPowerKw = gridTargetPowerKw - newTargetPowerKw;
    const actionEnergyKwh = actionPowerKw * durationHours;
    if (actionEnergyKwh <= 0) return [];

    state.plannedKwh += actionEnergyKwh;

    return [
      new ActionProposal({
        strategyId: this.id,
        priority: this.priority,
        action: new Action({
          type: 'set-grid-target',
          start,
          end,
          gridTargetPowerKw: newTargetPowerKw,
          reason: 'AVOID_NEGATIVE_PRICE_EXPORT_DISTRIBUTED',
          expectedBenefit: {
            type: 'avoided-negative-price-export',
            estimatedEnergyKwh: actionEnergyKwh,
          },
          confidence: 1,
        }),
      }),
    ];
  }

  summarizeRun(state) {
    return {
      remainingExportEnergyKwh: Math.max(
        0,
        state.totalRequiredKwh - state.plannedKwh
      ),
      totalPlannedExportEnergyKwh: state.plannedKwh,
    };
  }
}

/**
 * Precomputes, once per run, the total export surplus of all negative-price
 * timesteps and the set of candidate timesteps (non-negative price and
 * before the first negative-price timestep).
 */
function initializeState(state, series) {
  if (state.initialized) return;

  let firstNegativeStart = null;
  let totalRequiredKwh = 0;

  for (const timestep of series) {
    const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);
    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    if (spotPerKwh >= 0) continue;

    if (firstNegativeStart === null || start < firstNegativeStart) {
      firstNegativeStart = start;
    }
    const targetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
    const allowedExportEnergyKwh =
      Math.max(0, -targetPowerKw) * durationHours;
    totalRequiredKwh += Math.max(
      0,
      Number(timestep.grid?.exportKwh ?? 0) - allowedExportEnergyKwh
    );
  }

  const candidateIndices = new Set();
  for (let i = 0; i < series.length; i += 1) {
    const timestep = series[i];
    const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);
    if (spotPerKwh < 0) continue;
    const start = new Date(timestep.start);
    if (firstNegativeStart !== null && start >= firstNegativeStart) continue;
    candidateIndices.add(i);
  }

  state.totalRequiredKwh = totalRequiredKwh;
  state.candidateIndices = candidateIndices;
  state.candidatesSeen = 0;
  state.plannedKwh = 0;
  state.initialized = true;
}

function validatePositiveOrZero(value, name) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(name + ' must be a non-negative finite number');
}

function validatePriority(value) {
  if (!Number.isFinite(value))
    throw new Error('priority must be a finite number');
}
