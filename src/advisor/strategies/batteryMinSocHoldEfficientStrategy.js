import { Action } from '../action.js';
import { ActionProposal } from '../action-proposal.js';
import { Strategy } from '../strategy.js';
import { getTimestepDurationHours } from '../timestep-duration.js';
import { lookupEfficiency } from '../../components/battery.js';

const DEFAULT_MIN_SOC_PERCENT = 0.15;
const EPSILON = 1e-9;

/**
 * Keeps the battery state of charge above a configured minimum using an efficient
 * chunk-based approach that optimizes for effective cost (price / charge efficiency).
 *
 * Unlike the basic BatteryMinSocHoldStrategy which charges at maximum power in the
 * cheapest slots, this strategy:
 * 1. Identifies SOC deficits
 * 2. Splits the required energy into chunks
 * 3. For each chunk, finds the most cost-effective past timestep considering:
 *    - Grid buy price per kWh
 *    - Charge efficiency at the power level required for that chunk
 *    - Already planned charges in that timestep
 *
 * This ensures that:
 * - Very cheap slots are still preferred even with some efficiency loss
 * - Energy is distributed more evenly to maintain higher efficiency
 * - Overall cost is minimized while respecting efficiency constraints
 *
 * A hysteresis band (minSocHysteresisKwh) prevents on/off toggling of grid
 * purchases: new purchases are only planned when the effective SOC drops
 * below the minimum SOC, but a triggered purchase covers the SOC up to
 * minimum + hysteresis. Small SOC or forecast fluctuations within the
 * band therefore do not switch charging back and forth.
 */
export class BatteryMinSocHoldEfficientStrategy extends Strategy {
  constructor({
    capacityKwh,
    minSocKwh,
    minSocPercent,
    minSocHysteresisKwh,
    minSocHysteresisPercent,
    maxChargePowerKw,
    chargeEfficiencyCurve = null,
    chunkSizeKwh = null,
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
    if (minSocHysteresisKwh === undefined) {
      const hysteresisPercent =
        minSocHysteresisPercent === undefined ? 0 : minSocHysteresisPercent;
      if (
        !Number.isFinite(hysteresisPercent) ||
        hysteresisPercent < 0 ||
        hysteresisPercent > 1
      ) {
        throw new Error('minSocHysteresisPercent must be between 0 and 1');
      }
      minSocHysteresisKwh = capacityKwh * hysteresisPercent;
    }
    if (
      !Number.isFinite(minSocHysteresisKwh) ||
      minSocHysteresisKwh < 0 ||
      minSocKwh + minSocHysteresisKwh > capacityKwh
    ) {
      throw new Error(
        'minSocHysteresisKwh must be between 0 and capacityKwh - minSocKwh'
      );
    }
    if (!Number.isFinite(maxChargePowerKw) || maxChargePowerKw < 0) {
      throw new Error('maxChargePowerKw must be a non-negative finite number');
    }
    this.capacityKwh = capacityKwh;
    this.minSocKwh = minSocKwh;
    this.minSocHysteresisKwh = minSocHysteresisKwh;
    this.maxChargePowerKw = maxChargePowerKw;
    this.chargeEfficiencyCurve = chargeEfficiencyCurve;
    this.chunkSizeKwh = chunkSizeKwh;
  }

  get id() {
    return 'battery-min-soc-hold-efficient';
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
          reason: 'HOLD_BATTERY_MIN_SOC_EFFICIENT',
          expectedBenefit: {
            type: 'battery-min-soc-charge-efficient',
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
      minSocHysteresisKwh: state.minSocHysteresisKwh,
      totalPlannedImportKwh: state.totalPlannedImportKwh,
      totalPlannedSocGainKwh: state.totalPlannedSocGainKwh,
      uncoveredDeficitKwh: state.uncoveredDeficitKwh,
      chunksPlanned: state.chunksPlanned,
      averageEfficiency: state.averageEfficiency,
    };
  }
}

/**
 * Precomputes, once per run, the import to plan for every timestep so that
 * the battery SOC never falls below the strategy's minimum SOC.
 */
function initializeState(state, series, strategy) {
  if (state.initialized) return;

  const minSocKwh = strategy.minSocKwh;
  const minSocHysteresisKwh = strategy.minSocHysteresisKwh;
  // Once a deficit triggered a purchase, the purchase covers the SOC up to
  // this hysteresis target instead of only up to the minimum SOC.
  const targetSocKwh = minSocKwh + minSocHysteresisKwh;
  const maxChargePowerKw = strategy.maxChargePowerKw;
  const chargeEfficiencyCurve = strategy.chargeEfficiencyCurve;

  // Determine chunk size
  const defaultChunkSize = Math.max(maxChargePowerKw * 0.25, 0.5);
  const chunkSizeKwh = strategy.chunkSizeKwh ||
    (chargeEfficiencyCurve
      ? calculateOptimalChunkSize(series, chargeEfficiencyCurve, maxChargePowerKw)
      : Math.max(defaultChunkSize, 0.5));

  // Build entries with all necessary data
  const entries = series.map((timestep, index) => {
    const start = new Date(timestep.start);
    const end = new Date(timestep.end);
    const durationHours = getTimestepDurationHours(start, end);
    const socEndKwh = Number(timestep.battery?.energyKwh);
    const buyPerKwhRaw = timestep.grid?.buyPerKwh;
    const importKwh = Number(timestep.grid?.importKwh);
    const targetPowerKw = Number(timestep.grid?.targetPowerKw);
    const targetImportKwh =
      Number.isFinite(targetPowerKw) && targetPowerKw > 0
        ? targetPowerKw * durationHours
        : 0;
    return {
      index,
      durationHours,
      socEndKwh: Number.isFinite(socEndKwh) ? socEndKwh : null,
      buyPerKwh: (buyPerKwhRaw == null || !Number.isFinite(buyPerKwhRaw)) ? Infinity : Number(buyPerKwhRaw),
      uncoveredImportKwh: Number.isFinite(importKwh)
        ? Math.max(0, importKwh - targetImportKwh)
        : 0,
    };
  });

  // Track planned imports per timestep
  const plannedImportKwh = new Array(series.length).fill(0);
  const plannedSocGainKwh = new Array(series.length).fill(0);
  const plannedChunks = new Array(series.length).fill(0);

  let coveredSocGainKwh = 0;
  let uncoveredDeficitKwh = 0;
  let uncoveredImportRunningKwh = 0;
  let totalChunks = 0;
  let totalEfficiencySum = 0;

  // Pre-calculate remaining capacity for each slot
  const remainingCapacityKwh = entries.map(e =>
    maxChargePowerKw * e.durationHours
  );

  // Process each timestep to identify deficits
  for (let i = 0; i < entries.length; i += 1) {
    uncoveredImportRunningKwh += entries[i].uncoveredImportKwh;
    const socEndKwh = entries[i].socEndKwh;
    if (socEndKwh === null) continue;

    const unflooredSocEndKwh = socEndKwh - uncoveredImportRunningKwh;
    const effectiveSocEndKwh = unflooredSocEndKwh + coveredSocGainKwh;
    // Hysteresis band: only plan new purchases when the effective SOC drops
    // below the minimum SOC. Within the band (between the minimum and the
    // hysteresis target) nothing is re-triggered, so small SOC or forecast
    // fluctuations do not toggle charging on and off.
    if (effectiveSocEndKwh >= minSocKwh - EPSILON) continue;

    // A triggered deficit is covered up to the hysteresis target.
    let neededSocGainKwh = targetSocKwh - effectiveSocEndKwh;

    // Split the deficit into chunks
    const chunks = splitIntoChunks(neededSocGainKwh, chunkSizeKwh);
    totalChunks += chunks.length;

    // For each chunk, find the best past timestep
    for (const chunk of chunks) {
      let bestSlotIndex = -1;
      let bestEffectiveCost = Infinity;

      // Look at all past timesteps (including current)
      for (let j = 0; j <= i; j += 1) {
        const slot = entries[j];

        // Skip timesteps without a buy price - no reaction should be planned for these
        if (slot.buyPerKwh >= Infinity) continue;

        // Check remaining capacity
        if (remainingCapacityKwh[j] < chunk.sizeKwh - EPSILON) continue;

        // Calculate power required for this chunk in this slot
        const powerKw = chunk.sizeKwh / slot.durationHours;

        // Skip if power exceeds max (shouldn't happen with our capacity calc, but safety check)
        if (powerKw > maxChargePowerKw + EPSILON) continue;

        // Calculate efficiency at this power level
        const efficiency = lookupEfficiency(
          chargeEfficiencyCurve,
          powerKw,
          1
        );

        // Calculate effective cost (price / efficiency)
        const effectiveCost = slot.buyPerKwh / Math.max(efficiency, EPSILON);

        // Prefer: lowest effective cost, then earliest
        if (
          effectiveCost < bestEffectiveCost - EPSILON ||
          (Math.abs(effectiveCost - bestEffectiveCost) < EPSILON && j < bestSlotIndex)
        ) {
          bestEffectiveCost = effectiveCost;
          bestSlotIndex = j;
        }
      }

      // If we found a good slot, assign the chunk
      if (bestSlotIndex >= 0) {
        const slot = entries[bestSlotIndex];
        const powerKw = chunk.sizeKwh / slot.durationHours;
        const efficiency = lookupEfficiency(
          chargeEfficiencyCurve,
          powerKw,
          1
        );

        // Calculate actual SOC gain (considering efficiency)
        const socGainKwh = chunk.sizeKwh * efficiency;

        plannedImportKwh[bestSlotIndex] += chunk.sizeKwh;
        plannedSocGainKwh[bestSlotIndex] += socGainKwh;
        plannedChunks[bestSlotIndex] += 1;
        remainingCapacityKwh[bestSlotIndex] -= chunk.sizeKwh;
        coveredSocGainKwh += socGainKwh;
        neededSocGainKwh -= chunk.sizeKwh;
        totalEfficiencySum += efficiency * chunk.sizeKwh;
      }
    }

    if (neededSocGainKwh > EPSILON) {
      uncoveredDeficitKwh += neededSocGainKwh;
    }
  }

  // Store results in state
  state.minSocKwh = minSocKwh;
  state.minSocHysteresisKwh = minSocHysteresisKwh;
  state.plannedImportKwh = plannedImportKwh;
  state.plannedSocGainKwh = plannedSocGainKwh;
  state.totalPlannedImportKwh = plannedImportKwh.reduce((a, b) => a + b, 0);
  state.totalPlannedSocGainKwh = plannedSocGainKwh.reduce((a, b) => a + b, 0);
  state.uncoveredDeficitKwh = uncoveredDeficitKwh;
  state.chunksPlanned = totalChunks;
  state.averageEfficiency =
    state.totalPlannedImportKwh > 0
      ? totalEfficiencySum / state.totalPlannedImportKwh
      : 1;
  state.initialized = true;
}

/**
 * Splits energy into chunks of specified size
 */
function splitIntoChunks(totalKwh, chunkSizeKwh) {
  const chunks = [];

  // Ensure chunk size is valid
  const validChunkSize = Number.isFinite(chunkSizeKwh) && chunkSizeKwh > 0
    ? chunkSizeKwh
    : Math.max(totalKwh * 0.1, 0.1); // Fallback to 10% of total or 0.1 kWh

  let remaining = totalKwh;

  while (remaining > EPSILON) {
    const size = Math.min(validChunkSize, remaining);
    chunks.push({ sizeKwh: size });
    remaining -= size;
  }

  return chunks;
}

/**
 * Calculates optimal chunk size based on efficiency curve and typical slot duration
 */
function calculateOptimalChunkSize(series, chargeEfficiencyCurve, maxChargePowerKw) {
  if (!chargeEfficiencyCurve || !series.length) {
    return maxChargePowerKw * 0.25;
  }

  // Find the typical slot duration
  const firstSlot = series[0];
  const start = new Date(firstSlot.start);
  const end = new Date(firstSlot.end);
  const typicalDurationHours = getTimestepDurationHours(start, end);

  // Find power level with best efficiency
  const points = chargeEfficiencyCurve;
  let bestEfficiency = 0;
  let bestPower = maxChargePowerKw;

  for (const point of points) {
    if (point.efficiency > bestEfficiency) {
      bestEfficiency = point.efficiency;
      bestPower = point.up_to_kw;
    }
  }

  // Use power level with best efficiency, but cap at max
  const optimalPower = Math.min(bestPower, maxChargePowerKw);

  // Chunk size = optimal power * typical duration
  return optimalPower * typicalDurationHours;
}
