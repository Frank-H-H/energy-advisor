import { describe, it, expect } from 'vitest';
import { mapConfigsToComponents } from '../../src/configs/schemas.js';

describe('config mapping of efficiency curves', () => {
  it('maps configured efficiency curves', () => {
    const comps = mapConfigsToComponents(
      {
        capacity_kwh: 43,
        charge_efficiency_curve: [
          { up_to_kw: 8, efficiency: 0.965 },
          { up_to_kw: 5, efficiency: 0.98 },
        ],
        discharge_efficiency_curve: [
          { up_to_kw: 0.5, efficiency: 1 },
          { up_to_kw: 8, efficiency: 0.97 },
        ],
      },
      null
    );

    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 5, efficiency: 0.98 },
      { up_to_kw: 8, efficiency: 0.965 },
    ]);
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0.5, efficiency: 1 },
      { up_to_kw: 8, efficiency: 0.97 },
    ]);
  });

  it('accepts JSON string curves as stored by the Node-RED config node', () => {
    const comps = mapConfigsToComponents(
      {
        charge_efficiency_curve: '[{"up_to_kw": 5, "efficiency": 0.98}]',
        discharge_efficiency_curve: '[{"up_to_kw": 6, "efficiency": 0.95}]',
      },
      null
    );

    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 5, efficiency: 0.98 },
    ]);
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 6, efficiency: 0.95 },
    ]);
  });

  it('filters invalid curve points', () => {
    const comps = mapConfigsToComponents(
      {
        charge_efficiency_curve: [
          { up_to_kw: 5, efficiency: 0.98 },
          { up_to_kw: -1, efficiency: 0.9 },
          { up_to_kw: 6, efficiency: 1.2 },
          'nonsense',
        ],
        discharge_efficiency_curve: 'not-json',
      },
      null
    );

    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 5, efficiency: 0.98 },
    ]);
    // an unusable curve falls back to the 97% default
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 },
    ]);
  });

  it('defaults to the 97% efficiency curves when nothing is configured', () => {
    const comps = mapConfigsToComponents(null, null);

    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 },
    ]);
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 },
    ]);
  });

  it('falls back to the 97% default curve for empty curves', () => {
    const comps = mapConfigsToComponents(
      { charge_efficiency_curve: '[]', discharge_efficiency_curve: [] },
      null
    );

    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 },
    ]);
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 },
    ]);
  });
});
