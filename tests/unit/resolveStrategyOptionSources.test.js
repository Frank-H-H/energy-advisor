import { describe, expect, it } from 'vitest';
import { resolveStrategyOptionSources } from '../../src/advisor/strategyRegistry.js';

const baseEntry = {
  type: 'battery-min-soc-hold-efficient',
  batteryConfig: 'bat1',
  minSocPercent: 15
};

function resolverWith(msg) {
  return (path) =>
    path
      .split('.')
      .reduce((obj, key) => (obj == null ? undefined : obj[key]), msg);
}

describe('resolveStrategyOptionSources', () => {
  it('passes fixed values through unchanged', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources([baseEntry], {
      getMessageProperty: resolverWith({})
    });
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks).toHaveLength(0);
  });

  it('resolves a msg source and overrides the fixed value', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      {
        getMessageProperty: resolverWith({
          payload: { battery: { minSocPercent: 20 } }
        })
      }
    );
    expect(configs[0].minSocPercent).toBe(20);
    expect(configs[0].minSocPercentSource).toBeUndefined();
    expect(fallbacks).toHaveLength(0);
  });

  it('falls back to the fixed value when the msg path is missing', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      { getMessageProperty: resolverWith({ payload: {} }) }
    );
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks).toEqual([
      {
        type: 'battery-min-soc-hold-efficient',
        option: 'minSocPercent',
        path: 'payload.battery.minSocPercent',
        reason: 'missing'
      }
    ]);
  });

  it('falls back when the msg value is not a finite number', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      {
        getMessageProperty: resolverWith({
          payload: { battery: { minSocPercent: 'twenty' } }
        })
      }
    );
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks[0].reason).toBe('invalid');
  });

  it('falls back when the msg value is outside the option range', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      {
        getMessageProperty: resolverWith({
          payload: { battery: { minSocPercent: 150 } }
        })
      }
    );
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks[0].reason).toBe('invalid');
  });

  it('accepts a msg value at the range boundary', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      {
        getMessageProperty: resolverWith({
          payload: { battery: { minSocPercent: 0 } }
        })
      }
    );
    expect(configs[0].minSocPercent).toBe(0);
    expect(fallbacks).toHaveLength(0);
  });

  it('does not throw when reading the msg property throws', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }],
      {
        getMessageProperty: () => {
          throw new Error('bad path');
        }
      }
    );
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks[0].reason).toBe('missing');
  });

  it('ignores sources of unknown strategy types or options', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ type: 'unknown-strategy', minSocPercentSource: 'payload.x' }],
      { getMessageProperty: resolverWith({ payload: { x: 20 } }) }
    );
    expect(configs[0].type).toBe('unknown-strategy');
    expect(fallbacks).toHaveLength(0);
  });

  it('handles entries without a resolver function', () => {
    const { configs, fallbacks } = resolveStrategyOptionSources(
      [{ ...baseEntry, minSocPercentSource: 'payload.battery.minSocPercent' }]
    );
    expect(configs[0].minSocPercent).toBe(15);
    expect(fallbacks[0].reason).toBe('missing');
  });
});
