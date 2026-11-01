import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';
import { getTimestepDurationHours } from '../timestep-duration.js';
import { lookupEfficiency } from '../../components/battery.js';

const DEFAULT_MIN_SOC_PERCENT = 0.15;
const DEFAULT_PRIORITY = 50;
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
 * Purchases lift the SOC of all later timesteps additively; the base
 * trajectory is not re-simulated (see the advisor specification).
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
    maxChargePowerKw,
    chargeEfficiencyCurve = null,
    priority = DEFAULT_PRIORITY,
  } = {}) {
    super();
    if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
      throw new Error('capacityKwh must be a positive finite number');
    }
    if (minSocKwh === undefined) {
      // Fixed for now; will become configurable on the advisor node.
      minSocKwh = capacityKwh * DEFAULT_MIN_SOC_PERCENT;
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
    if (!Number.isFinite(priority)) {
      throw new Error('priority must be a finite number');
    }
    this.capacityKwh = capacityKwh;
    this.minSocKwh = minSocKwh;
    this.maxChargePowerKw = maxChargePowerKw;
    this.chargeEfficiencyCurve = chargeEfficiencyCurve;
    this.priority = priority;
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
        priority: this.priority,
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
 * Deficit timesteps (battery.energyKwh below the minimum at the end of the
 * timestep) are processed chronologically. For every deficit the cheapest
 * still available earlier timesteps (by grid.buyPerKwh, ties resolved by
 * chronological order) are charged until the deficit is covered. The SOC
 * gain of all planned purchases carries forward additively to all later
 * timesteps, so a single purchase can cover several later deficits.
 *
 * If even the full charge power in every available timestep cannot cover a
 * deficit, the remainder is accumulated as uncoveredDeficitKwh.
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
    return {
      durationHours,
      socEndKwh: Number.isFinite(socEndKwh) ? socEndKwh : null,
      buyPerKwh: Number.isFinite(buyPerKwh) ? buyPerKwh : Infinity,
    };
  });

  const remainingImportKwh = entries.map(
    (entry) => strategy.maxChargePowerKw * entry.durationHours
  );
  const plannedImportKwh = new Array(series.length).fill(0);
  const plannedSocGainKwh = new Array(series.length).fill(0);

  let coveredSocGainKwh = 0;
  let uncoveredDeficitKwh = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const socEndKwh = entries[i].socEndKwh;
    if (socEndKwh === null) continue;
    let neededSocGainKwh = minSocKwh - socEndKwh - coveredSocGainKwh;
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
