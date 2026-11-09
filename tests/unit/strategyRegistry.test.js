import { describe, expect, it } from 'vitest';
import {
  advisorStrategyRegistry,
  getStrategyDescriptors,
  normalizeStrategyConfigs,
  createStrategies
} from '../../src/advisor/strategyRegistry.js';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { ImmediateNegativePriceExportStrategy } from '../../src/advisor/strategies/immediateNegativePriceExportStrategy.js';
import { BatteryMinSocHoldStrategy } from '../../src/advisor/strategies/batteryMinSocHoldStrategy.js';

const batteryConfig = {
  capacity_kwh: 10,
  max_charge_power_kw: 4,
  charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 1 }]
};

const ctx = {
  getBatteryConfig: (id) => (id === 'bat1' ? batteryConfig : null)
};

describe('strategy registry', () => {
  it('describes all available strategies for the node editor', () => {
    expect(Object.keys(advisorStrategyRegistry).sort()).toEqual([
      'battery-min-soc-hold',
      'battery-min-soc-hold-efficient',
      'distributed-negative-price-export',
      'immediate-negative-price-export'
    ]);

    const descriptors = getStrategyDescriptors();
    expect(descriptors).toHaveLength(4);
    descriptors.forEach((descriptor) => {
      expect(typeof descriptor.id).toBe('string');
      expect(typeof descriptor.label).toBe('string');
      expect(Array.isArray(descriptor.options)).toBe(true);
      expect(descriptor.id).toBe(advisorStrategyRegistry[descriptor.id].label && descriptor.id);
    });
  });

  it('normalizes the legacy comma-separated string into configuration entries', () => {
    expect(
      normalizeStrategyConfigs(' immediate-negative-price-export , distributed-negative-price-export ')
    ).toEqual([
      { type: 'immediate-negative-price-export' },
      { type: 'distributed-negative-price-export' }
    ]);
  });

  it('normalizes an array of plain ids and an array of entries', () => {
    expect(normalizeStrategyConfigs(['immediate-negative-price-export'])).toEqual([
      { type: 'immediate-negative-price-export' }
    ]);
    expect(
      normalizeStrategyConfigs([
        { type: 'immediate-negative-price-export', maxExportPowerKw: 5 }
      ])
    ).toEqual([{ type: 'immediate-negative-price-export', maxExportPowerKw: 5 }]);
  });

  it('returns an empty list for missing or empty configurations', () => {
    expect(normalizeStrategyConfigs(undefined)).toEqual([]);
    expect(normalizeStrategyConfigs('')).toEqual([]);
    expect(normalizeStrategyConfigs(' , ')).toEqual([]);
  });

  it('falls back to the node-level legacy battery config for migrated battery strategies', () => {
    expect(
      normalizeStrategyConfigs('battery-min-soc-hold', {
      'battery-min-soc-hold-efficient',
        legacyBatteryConfig: 'bat1'
      })
    ).toEqual([{ type: 'battery-min-soc-hold', batteryConfig: 'bat1' }]);
      'battery-min-soc-hold-efficient',

    expect(
      normalizeStrategyConfigs([{ type: 'battery-min-soc-hold', batteryConfig: 'bat2' }], {
      'battery-min-soc-hold-efficient',
        legacyBatteryConfig: 'bat1'
      })
    ).toEqual([{ type: 'battery-min-soc-hold', batteryConfig: 'bat2' }]);
      'battery-min-soc-hold-efficient',
  });

  it('creates export strategies with the configured or default export power', () => {
    const [strategy] = createStrategies([
      { type: 'immediate-negative-price-export' }
    ]);
    expect(strategy).toBeInstanceOf(ImmediateNegativePriceExportStrategy);
    expect(strategy.maxExportPowerKw).toBeCloseTo(7.46, 10);

    const [custom] = createStrategies([
      { type: 'immediate-negative-price-export', maxExportPowerKw: '4' }
    ]);
    expect(custom.maxExportPowerKw).toBeCloseTo(4, 10);
  });

  it('creates the battery strategy from a battery config node and minSocPercent', () => {
    const [strategy] = createStrategies(
      [{ type: 'battery-min-soc-hold', batteryConfig: 'bat1', minSocPercent: 20 }],
      'battery-min-soc-hold-efficient',
      ctx
    );
    expect(strategy).toBeInstanceOf(BatteryMinSocHoldStrategy);
    expect(strategy.minSocKwh).toBeCloseTo(2, 10);

    const [defaultPercent] = createStrategies(
      [{ type: 'battery-min-soc-hold', batteryConfig: 'bat1' }],
      'battery-min-soc-hold-efficient',
      ctx
    );
    expect(defaultPercent.minSocKwh).toBeCloseTo(1.5, 10);
  });

  it('rejects the battery strategy without a battery config reference', () => {
    expect(() =>
      createStrategies([{ type: 'battery-min-soc-hold' }], ctx)
    ).toThrow('battery-min-soc-hold requires a battery config');
  });

  it('rejects unknown strategy types', () => {
    expect(() => createStrategies([{ type: 'unknown-strategy' }])).toThrow(
      'Unknown advisor strategy: unknown-strategy'
    );
  });

  it('creates strategies in the configured order and runs them with the engine', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:15:00Z',
        grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 }
      },
      {
        start: '2026-01-01T00:15:00Z',
        end: '2026-01-01T00:30:00Z',
        grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: -1 }
      }
    ];

    const strategies = createStrategies([
      { type: 'immediate-negative-price-export' },
      { type: 'distributed-negative-price-export' }
    ]);
    const plan = AdvisorEngine.run({ timeSeries, strategies });

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(-7.46, 10);
  });
});
