import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';
import { getTimestepDurationHours } from '../timestep-duration.js';
import { lookupEfficiency } from '../../components/battery.js';

const DEFAULT_MIN_SOC_PERCENT = 0.15;
const EPSILON = 1e-9;

/**
 * Keeps the battery state of charge above a configured minimum.
 *
 * The strategy analyses the battery SOC trajectory of the TimeSeries
 * (battery.energyKwh, the SOC at the end of each timestep). Whenever the
 * SOC would drop below the minimum, it plans grid imports at earlier
 * timesteps so that the SOC never falls below the minimum.
 *
 * Purchases are selected per deficit timestep by ascending grid.buyPerKwh
 * (ties: chronologically first); timesteps without a buy price are used as
 * a last resort. The required import of a purchase is derived from the
 * required SOC gain and the power dependent charge efficiency curve; the
 * configured max charge power caps the import of a timestep and the
 * remainder is bought at the next cheapest timestep.
 *
 * Hard guarantee: if even charging at full max charge power in every
 * available timestep cannot cover a deficit, the strategy buys as much as
 * possible and reports the remainder via summarizeRun() as
 * uncoveredDeficitKwh.
 *
 * Deficits are evaluated against the effective SOC of each timestep: the
 * reported SOC minus the grid energy the base simulation had to import
 * beyond the grid target (the load the grid served because the battery
 * was empty) plus the SOC gain of all purchases planned so far. Purchased
 * energy is therefore consumed by the load of later timesteps instead of
 * lifting the SOC of all later timesteps forever, so runs of consecutive
 * deficit timesteps are covered step by step. The base trajectory is not
 * re-simulated (see the advisor specification); without grid.importKwh
 * data the drain at an empty battery is unknown and the strategy falls
 * back to the purely additive model.
 *
 * Applied per timestep by the AdvisorEngine: the whole plan is precomputed
 * once per run in the strategy state; planTimestep() only emits the
 * proposal of the current timestep. The strategy only creates proposals.
 * It never changes the timestep it receives and never executes an action.
 */
export class BatteryMinSocHoldStrategy extends Strategy {
  constructor({
    capacityKwh,
    minSocKwh,
    minSocPercent,
    maxChargePowerKw,
    chargeEfficiencyCurve = null,
  } = {}) {
    super();
    if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
      throw new Error('capacityKwh must be a positive finite number');
    }
    if (minSocKwh === undefined) {
      const percent =
        minSocPercent === undefined ? DEFAULT_MIN_SOC_PERCENT : minSocPercent;
      if (!Number.isFinite(percent) || percent < 0 || percent > 1) {
        throw new Error('minSocPercent must be between 0 and 1');
      }
      minSocKwh = capacityKwh * percent;
    }
    if (
      !Number.isFinite(minSocKwh) ||
      minSocKwh < 0 ||
      minSocKwh > capacityKwh
    ) {
      throw new Error('minSocKwh must be between 0 and capacityKwh');
    }
    if (!Number.isFinite(maxChargePowerKw) || maxChargePowerKw < 0) {
      throw new Error('maxChargePowerKw must be a non-negative finite number');
    }
    this.capacityKwh = capacityKwh;
    this.minSocKwh = minSocKwh;
    this.maxChargePowerKw = maxChargePowerKw;
    this.chargeEfficiencyCurve = chargeEfficiencyCurve;
  }

  get id() {
    return 'battery-min-soc-hold';
  }

  planTimestep(timestep, context = {}) {
    const { series, index, state } = context;
    if (!Array.isArray(series) || !Number.isInteger(index) || !state) {
      throw new Error(
        'planTimestep() requires a context with series, index and state'
      );
    }
    initializeState(state, series, this);

    const plannedImportKwh = state.plannedImportKwh[index];
    if (plannedImportKwh <= EPSILON) return [];

    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const gridTargetPowerKw = Number(timestep.grid?.targetPowerKw ?? 0);
    const importPowerKw = plannedImportKwh / durationHours;

    return [
      new ActionProposal({
        strategyId: this.id,
        action: new Action({
          type: 'set-grid-target',
          start,
          end,
          gridTargetPowerKw: gridTargetPowerKw + importPowerKw,
          reason: 'HOLD_BATTERY_MIN_SOC',
          expectedBenefit: {
            type: 'battery-min-soc-charge',
            estimatedImportKwh: plannedImportKwh,
            estimatedSocGainKwh: state.plannedSocGainKwh[index],
          },
          confidence: 1,
        }),
      }),
    ];
  }

  summarizeRun(state) {
    if (!state.initialized) return undefined;
    return {
      minSocKwh: state.minSocKwh,
      totalPlannedImportKwh: state.totalPlannedImportKwh,
      totalPlannedSocGainKwh: state.totalPlannedSocGainKwh,
      uncoveredDeficitKwh: state.uncoveredDeficitKwh,
    };
  }
}

/**
 * Precomputes, once per run, the import to plan for every timestep so that
 * the battery SOC never falls below the strategy's minimum SOC.
 *
 * Deficit timesteps are processed chronologically. A timestep is a deficit
 * when its effective SOC - the reported battery.energyKwh minus the grid
 * energy that the base simulation had to import beyond the grid target
 * because the battery was empty, plus the SOC gain of all purchases
 * planned so far - is below the minimum. This unfloored view of the base
 * trajectory makes purchased energy consumed by later load: a purchase
 * only helps later timesteps while it is actually still stored in the
 * battery, so runs of consecutive deficit timesteps are covered step by
 * step instead of by a single purchase.
 *
 * For every deficit the cheapest still available earlier timesteps (by
 * grid.buyPerKwh, ties resolved by chronological order) are charged until
 * the deficit is covered. When the TimeSeries provides no grid.importKwh,
 * the drain while the battery sits empty cannot be observed; the strategy
 * then falls back to the old additive model, where purchases lift all
 * later timesteps.
 *
 * If even the full charge power in every available timestep cannot cover
 * a deficit, the remainder is accumulated as uncoveredDeficitKwh.
 */
function initializeState(state, series, strategy) {
  if (state.initialized) return;

  const minSocKwh = strategy.minSocKwh;
  const entries = series.map((timestep) => {
    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const socEndKwh = Number(timestep.battery?.energyKwh);
    const buyPerKwh = Number(timestep.grid?.buyPerKwh);
    const importKwh = Number(timestep.grid?.importKwh);
    const targetPowerKw = Number(timestep.grid?.targetPowerKw);
    const targetImportKwh =
      Number.isFinite(targetPowerKw) && targetPowerKw > 0
        ? targetPowerKw * durationHours
        : 0;
    return {
      durationHours,
      socEndKwh: Number.isFinite(socEndKwh) ? socEndKwh : null,
      buyPerKwh: Number.isFinite(buyPerKwh) ? buyPerKwh : Infinity,
      // Grid energy that served load because the battery was empty. It
      // keeps draining the battery in the effective (unfloored) trajectory.
      uncoveredImportKwh: Number.isFinite(importKwh)
        ? Math.max(0, importKwh - targetImportKwh)
        : 0,
    };
  });

  const remainingImportKwh = entries.map(
    (entry) => strategy.maxChargePowerKw * entry.durationHours
  );
  const plannedImportKwh = new Array(series.length).fill(0);
  const plannedSocGainKwh = new Array(series.length).fill(0);

  let coveredSocGainKwh = 0;
  let uncoveredDeficitKwh = 0;
  let uncoveredImportRunningKwh = 0;

  for (let i = 0; i < entries.length; i += 1) {
    uncoveredImportRunningKwh += entries[i].uncoveredImportKwh;
    const socEndKwh = entries[i].socEndKwh;
    if (socEndKwh === null) continue;
    // The SOC the battery would show without the floor at zero: the
    // reported SOC plus the load the grid served while the battery was
    // empty.
    const unflooredSocEndKwh = socEndKwh - uncoveredImportRunningKwh;
    let neededSocGainKwh =
      minSocKwh - unflooredSocEndKwh - coveredSocGainKwh;
    if (neededSocGainKwh <= EPSILON) continue;

    const candidates = [];
    for (let j = 0; j <= i; j += 1) {
      if (remainingImportKwh[j] > EPSILON) candidates.push(j);
    }
    candidates.sort(
      (a, b) => entries[a].buyPerKwh - entries[b].buyPerKwh || a - b
    );

    for (const j of candidates) {
      if (neededSocGainKwh <= EPSILON) break;
      const { externalKwh, socGainKwh } = solveExternalEnergy(
        neededSocGainKwh,
        entries[j].durationHours,
        strategy.maxChargePowerKw,
        strategy.chargeEfficiencyCurve
      );
      if (externalKwh <= EPSILON) continue;
      plannedImportKwh[j] += externalKwh;
      plannedSocGainKwh[j] += socGainKwh;
      remainingImportKwh[j] -= externalKwh;
      coveredSocGainKwh += socGainKwh;
      neededSocGainKwh -= socGainKwh;
    }

    if (neededSocGainKwh > EPSILON) {
      uncoveredDeficitKwh += neededSocGainKwh;
    }
  }

  state.minSocKwh = minSocKwh;
  state.plannedImportKwh = plannedImportKwh;
  state.plannedSocGainKwh = plannedSocGainKwh;
  state.totalPlannedImportKwh = plannedImportKwh.reduce((a, b) => a + b, 0);
  state.totalPlannedSocGainKwh = plannedSocGainKwh.reduce((a, b) => a + b, 0);
  state.uncoveredDeficitKwh = uncoveredDeficitKwh;
  state.initialized = true;
}

/**
 * Computes the external (grid side) import energy needed to achieve the
 * given SOC gain within one timestep, honouring the power dependent charge
 * efficiency curve and the max charge power.
 *
 * The efficiency depends on the resulting charge power and therefore on the
 * result itself; it is solved with a fixed point iteration. When the
 * required import exceeds the capacity of the timestep (max charge power
 * times duration), the timestep is charged at full power and the actually
 * achievable SOC gain is returned.
 */
function solveExternalEnergy(
  gainNeededKwh,
  durationHours,
  maxChargePowerKw,
  chargeEfficiencyCurve
) {
  const maxExternalKwh = maxChargePowerKw * durationHours;
  if (maxExternalKwh <= EPSILON) {
    return { externalKwh: 0, socGainKwh: 0 };
  }

  let externalKwh = Math.min(gainNeededKwh, maxExternalKwh);
  for (let i = 0; i < 10; i += 1) {
    const powerKw = externalKwh / durationHours;
    const efficiency = lookupEfficiency(chargeEfficiencyCurve, powerKw, 1);
    const requiredKwh = gainNeededKwh / efficiency;
    if (requiredKwh >= maxExternalKwh) {
      const cappedEfficiency = lookupEfficiency(
        chargeEfficiencyCurve,
        maxChargePowerKw,
        1
      );
      return {
        externalKwh: maxExternalKwh,
        socGainKwh: maxExternalKwh * cappedEfficiency,
      };
    }
    if (Math.abs(requiredKwh - externalKwh) < 1e-12) break;
    externalKwh = requiredKwh;
  }

  const efficiency = lookupEfficiency(
    chargeEfficiencyCurve,
    externalKwh / durationHours,
    1
  );
  return { externalKwh, socGainKwh: externalKwh * efficiency };
}
