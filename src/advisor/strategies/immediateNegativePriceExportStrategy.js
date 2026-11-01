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
 * Applied per timestep by the AdvisorEngine: on every non-negative-price
 * timestep it exports as much of the still pending negative-price surplus
 * as the configured maximum export power allows. The pending surplus per
 * timestep is precomputed once per run by walking the series backwards,
 * which is equivalent to planning the whole series in one backwards pass.
 *
 * The strategy only creates proposals. It never changes the timestep it
 * receives and never executes an action.
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

  planTimestep(timestep, context = {}) {
    const { series, index, state } = context;
    if (!Array.isArray(series) || !Number.isInteger(index) || !state) {
      throw new Error(
        'planTimestep() requires a context with series, index and state'
      );
    }
    initializeState(state, series, this.maxExportPowerKw);

    const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);
    if (spotPerKwh < 0) return [];

    const remainingExportEnergyKwh = state.pendingSurplusKwh[index];
    if (remainingExportEnergyKwh <= 0) return [];

    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const gridTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);

    const desiredPowerKw = Math.min(
      this.maxExportPowerKw,
      remainingExportEnergyKwh / durationHours
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
          reason: 'AVOID_NEGATIVE_PRICE_EXPORT',
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
        state.totalSurplusKwh - state.plannedKwh
      ),
      totalPlannedExportEnergyKwh: state.plannedKwh,
    };
  }
}

/**
 * Precomputes, once per run, the export surplus that is still pending when
 * the (backwards) planning pass arrives at each timestep. For a
 * negative-price timestep the surplus is the exported energy that the
 * existing target cannot absorb; for a non-negative-price timestep the
 * absorbable capacity is subtracted again. This reproduces the previous
 * whole-series backwards planning exactly, but allows the strategy to be
 * applied timestep by timestep.
 */
function initializeState(state, series, maxExportPowerKw) {
  if (state.initialized) return;

  const pendingSurplusKwh = new Array(series.length);
  let remaining = 0;
  let totalSurplusKwh = 0;

  for (let i = series.length - 1; i >= 0; i -= 1) {
    pendingSurplusKwh[i] = remaining;

    const timestep = series[i];
    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const spotPerKwh = Number(timestep.grid?.spotPerKwh ?? 0);

    if (spotPerKwh < 0) {
      const targetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
      const allowedExportEnergyKwh =
        Math.max(0, -targetPowerKw) * durationHours;
      const surplusKwh = Math.max(
        0,
        Number(timestep.grid?.exportKwh ?? 0) - allowedExportEnergyKwh
      );
      remaining += surplusKwh;
      totalSurplusKwh += surplusKwh;
    } else {
      const capacityKwh = Math.min(
        maxExportPowerKw * durationHours,
        remaining
      );
      remaining -= capacityKwh;
    }
  }

  state.pendingSurplusKwh = pendingSurplusKwh;
  state.totalSurplusKwh = totalSurplusKwh;
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
