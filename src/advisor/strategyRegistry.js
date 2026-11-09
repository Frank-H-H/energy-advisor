import { ImmediateNegativePriceExportStrategy } from './strategies/immediateNegativePriceExportStrategy.js';
import { DistributedNegativePriceExportStrategy } from './strategies/distributedNegativePriceExportStrategy.js';
import { BatteryMinSocHoldStrategy } from './strategies/batteryMinSocHoldStrategy.js';
import { BatteryMinSocHoldEfficientStrategy } from './strategies/batteryMinSocHoldEfficientStrategy.js';

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46;
const DEFAULT_MIN_SOC_PERCENT = 15;

function numberOption(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Strategy option must be a finite number: ' + value);
  }
  return number;
}

/**
 * Registry of all advisor strategies available to the Node-RED node.
 *
 * Each entry describes one strategy type for both the node editor
 * (label plus per-strategy editor options) and the node runtime
 * (a create() factory turning a stored configuration entry into a
 * strategy instance).
 *
 * Editor option types:
 * - 'number': rendered as a numeric input, stored as a number.
 * - 'battery-config': rendered as an energy-battery-config selection,
 *   stored as the config node id.
 */
export const advisorStrategyRegistry = {
  'immediate-negative-price-export': {
    label: 'Immediate negative-price export',
    options: [
      {
        name: 'maxExportPowerKw',
        label: 'Max export kW',
        type: 'number',
        default: DEFAULT_MAX_EXPORT_POWER_KW,
        min: 0,
        step: 0.01
      }
    ],
    create(config) {
      return new ImmediateNegativePriceExportStrategy({
        maxExportPowerKw: numberOption(
          config.maxExportPowerKw,
          DEFAULT_MAX_EXPORT_POWER_KW
        )
      });
    }
  },
  'distributed-negative-price-export': {
    label: 'Distributed negative-price export',
    options: [
      {
        name: 'maxExportPowerKw',
        label: 'Max export kW',
        type: 'number',
        default: DEFAULT_MAX_EXPORT_POWER_KW,
        min: 0,
        step: 0.01
      }
    ],
    create(config) {
      return new DistributedNegativePriceExportStrategy({
        maxExportPowerKw: numberOption(
          config.maxExportPowerKw,
          DEFAULT_MAX_EXPORT_POWER_KW
        )
      });
    }
  },
  'battery-min-soc-hold': {
    label: 'Battery minimum SOC hold',
    options: [
      {
        name: 'minSocPercent',
        label: 'Min SOC %',
        type: 'number',
        default: DEFAULT_MIN_SOC_PERCENT,
        min: 0,
        max: 100,
        step: 1
      },
      {
        name: 'batteryConfig',
        label: 'Battery config',
        type: 'battery-config'
      }
    ],
    create(config, ctx) {
      const batteryConfig = ctx.getBatteryConfig(config.batteryConfig);
      if (!batteryConfig) {
        throw new Error(
          'battery-min-soc-hold requires a battery config: select an energy-battery-config node for this strategy'
        );
      }
      const minSocPercent = numberOption(
        config.minSocPercent,
        DEFAULT_MIN_SOC_PERCENT
      );
      return new BatteryMinSocHoldStrategy({
        capacityKwh: batteryConfig.capacity_kwh,
        maxChargePowerKw: batteryConfig.max_charge_power_kw,
        chargeEfficiencyCurve: batteryConfig.charge_efficiency_curve,
        minSocPercent: minSocPercent / 100
      });
    }
  },
  'battery-min-soc-hold-efficient': {
    label: 'Battery minimum SOC hold (efficient)',
    options: [
      {
        name: 'minSocPercent',
        label: 'Min SOC %',
        type: 'number',
        default: DEFAULT_MIN_SOC_PERCENT,
        min: 0,
        max: 100,
        step: 1
      },
      {
        name: 'batteryConfig',
        label: 'Battery config',
        type: 'battery-config'
      },
      {
        name: 'chunkSizeKwh',
        label: 'Chunk size kWh (optional)',
        type: 'number',
        default: null,
        min: 0,
        step: 0.1
      }
    ],
    create(config, ctx) {
      const batteryConfig = ctx.getBatteryConfig(config.batteryConfig);
      if (!batteryConfig) {
        throw new Error(
          'battery-min-soc-hold-efficient requires a battery config: select an energy-battery-config node for this strategy'
        );
      }
      const minSocPercent = numberOption(
        config.minSocPercent,
        DEFAULT_MIN_SOC_PERCENT
      );
      const chunkSizeKwh = config.chunkSizeKwh !== null && config.chunkSizeKwh !== undefined
        ? numberOption(config.chunkSizeKwh, null)
        : null;
      return new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: batteryConfig.capacity_kwh,
        maxChargePowerKw: batteryConfig.max_charge_power_kw,
        chargeEfficiencyCurve: batteryConfig.charge_efficiency_curve,
        minSocPercent: minSocPercent / 100,
        chunkSizeKwh: chunkSizeKwh
      });
    }
  }
};

/**
 * Returns plain JSON descriptors (id, label, options) of all registered
 * strategies. Served to the node editor via the node's admin endpoint.
 */
export function getStrategyDescriptors() {
  return Object.entries(advisorStrategyRegistry).map(([id, descriptor]) => ({
    id,
    label: descriptor.label,
    options: descriptor.options
  }));
}

/**
 * Normalizes the stored strategies configuration into an array of
 * configuration entries ({ type, ...options }).
 *
 * Accepts the legacy comma-separated id string, an array of id strings
 * and the current array of configuration objects. For
 * 'battery-min-soc-hold' entries without their own battery config
 * reference the node-level legacyBatteryConfig is used as a fallback,
 * so flows configured before the strategy editor keep working.
 */
export function normalizeStrategyConfigs(
  strategies,
  { legacyBatteryConfig } = {}
) {
  let entries;
  if (typeof strategies === 'string') {
    entries = strategies
      .split(',')
      .map((id) => String(id).trim())
      .filter(Boolean)
      .map((type) => ({ type }));
  } else if (Array.isArray(strategies)) {
    entries = strategies.map((entry) =>
      typeof entry === 'string' ? { type: entry.trim() } : { ...entry }
    );
  } else {
    entries = [];
  }

  return entries
    .filter((entry) => entry.type && String(entry.type).trim())
    .map((entry) => ({ ...entry, type: String(entry.type).trim() }))
    .map((entry) =>
      entry.type === 'battery-min-soc-hold' &&
      !entry.batteryConfig &&
      legacyBatteryConfig
        ? { ...entry, batteryConfig: legacyBatteryConfig }
        : entry
    );
}

/**
 * Creates strategy instances from normalized configuration entries, in
 * the configured order. ctx.getBatteryConfig(id) resolves battery config
 * node references.
 */
export function createStrategies(configs = [], ctx = {}) {
  const getBatteryConfig = ctx.getBatteryConfig || (() => null);
  return configs.map((config) => {
    const descriptor = advisorStrategyRegistry[config.type];
    if (!descriptor) {
      throw new Error('Unknown advisor strategy: ' + config.type);
    }
    return descriptor.create(config, { getBatteryConfig });
  });
}
