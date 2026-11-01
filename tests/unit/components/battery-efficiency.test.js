import { describe, expect, it } from 'vitest';
import {
  Battery,
  lookupEfficiency,
  normalizeEfficiencyCurve,
} from '../../../src/components/battery.js';

describe('normalizeEfficiencyCurve', () => {
  it('normalizes and sorts a valid curve', () => {
    const curve = normalizeEfficiencyCurve([
      { up_to_kw: 8, efficiency: 0.965 },
      { up_to_kw: 5, efficiency: 0.98 },
    ]);

    expect(curve).toEqual([
      { up_to_kw: 5, efficiency: 0.98 },
      { up_to_kw: 8, efficiency: 0.965 },
    ]);
  });

  it('accepts a JSON string as used by the Node-RED config node', () => {
    const curve = normalizeEfficiencyCurve(
      '[{"up_to_kw": 0.5, "efficiency": 1}, {"up_to_kw": 8, "efficiency": 0.98}]'
    );

    expect(curve).toEqual([
      { up_to_kw: 0.5, efficiency: 1 },
      { up_to_kw: 8, efficiency: 0.98 },
    ]);
  });

  it('drops invalid points', () => {
    const curve = normalizeEfficiencyCurve([
      { up_to_kw: 5, efficiency: 0.98 },
      { up_to_kw: -1, efficiency: 0.9 },
      { up_to_kw: 6, efficiency: 0 },
      { up_to_kw: 7, efficiency: 1.5 },
      { up_to_kw: 'not-a-number', efficiency: 0.9 },
      null,
      { efficiency: 0.9 },
    ]);

    expect(curve).toEqual([{ up_to_kw: 5, efficiency: 0.98 }]);
  });

  it('drops later duplicates of the same power threshold', () => {
    const curve = normalizeEfficiencyCurve([
      { up_to_kw: 5, efficiency: 0.98 },
      { up_to_kw: 5, efficiency: 0.95 },
    ]);

    expect(curve).toEqual([{ up_to_kw: 5, efficiency: 0.98 }]);
  });

  it('returns null for empty or invalid curves', () => {
    expect(normalizeEfficiencyCurve([])).toBeNull();
    expect(normalizeEfficiencyCurve(null)).toBeNull();
    expect(normalizeEfficiencyCurve(undefined)).toBeNull();
    expect(normalizeEfficiencyCurve('not json')).toBeNull();
    expect(normalizeEfficiencyCurve('')).toBeNull();
    expect(normalizeEfficiencyCurve([{ up_to_kw: 1 }])).toBeNull();
  });
});

describe('lookupEfficiency', () => {
  const curve = [
    { up_to_kw: 5, efficiency: 0.98 },
    { up_to_kw: 8, efficiency: 0.96 },
  ];

  it('uses the first point below the lowest threshold', () => {
    expect(lookupEfficiency(curve, 0.5)).toBeCloseTo(0.98, 12);
  });

  it('uses the exact value at a breakpoint', () => {
    expect(lookupEfficiency(curve, 5)).toBeCloseTo(0.98, 12);
    expect(lookupEfficiency(curve, 8)).toBeCloseTo(0.96, 12);
  });

  it('interpolates linearly between breakpoints', () => {
    expect(lookupEfficiency(curve, 6.5)).toBeCloseTo(0.97, 12);
  });

  it('clamps above the last breakpoint', () => {
    expect(lookupEfficiency(curve, 12)).toBeCloseTo(0.96, 12);
  });

  it('falls back to the scalar efficiency when no curve is configured', () => {
    expect(lookupEfficiency(null, 5, 0.9)).toBeCloseTo(0.9, 12);
    expect(lookupEfficiency([], 5, 0.9)).toBeCloseTo(0.9, 12);
  });

  it('falls back to 1 for invalid fallbacks', () => {
    expect(lookupEfficiency(null, 5, 0)).toBeCloseTo(1, 12);
    expect(lookupEfficiency(null, 5, -1)).toBeCloseTo(1, 12);
  });
});

describe('Battery with efficiencies', () => {
  it('applies scalar charge efficiency to the SOC gain only', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      max_charge_power_kw: 5,
      charge_efficiency: 0.9,
    });

    const result = battery.applyPower(4, 1);

    expect(result.appliedPowerKw).toBe(4);
    expect(result.externalEnergyKwh).toBeCloseTo(4, 12);
    expect(result.energyKWh).toBeCloseTo(3.6, 12);
    expect(result.chargeLossKwh).toBeCloseTo(0.4, 12);
    expect(result.socAtEndKWh).toBeCloseTo(5.6, 12);
    expect(battery.soc).toBeCloseTo(5.6, 12);
  });

  it('applies scalar discharge efficiency to the SOC loss only', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      min_soc_kwh: 0,
      max_discharge_power_kw: 5,
      discharge_efficiency: 0.9,
    });

    const result = battery.applyPower(-4, 1);

    expect(result.appliedPowerKw).toBe(-4);
    // 4 kWh delivered externally, 4 / 0.9 drawn from SOC
    expect(result.externalEnergyKwh).toBeCloseTo(-4, 12);
    expect(result.energyKWh).toBeCloseTo(-4 / 0.9, 12);
    expect(result.dischargeLossKwh).toBeCloseTo(4 * (1 / 0.9 - 1), 12);
    expect(result.socAtEndKWh).toBeCloseTo(8 - 4 / 0.9, 12);
  });

  it('uses the power dependent charge efficiency curve', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      max_charge_power_kw: 8,
      charge_efficiency: 0.9,
      charge_efficiency_curve: [
        { up_to_kw: 5, efficiency: 0.98 },
        { up_to_kw: 8, efficiency: 0.96 },
      ],
    });

    // at 4 kW: 0.98
    expect(battery.applyPower(4, 1).energyKWh).toBeCloseTo(3.92, 12);
    battery.soc = 2;
    // at 6.5 kW: interpolated 0.97
    expect(battery.applyPower(6.5, 1).energyKWh).toBeCloseTo(6.305, 12);
    battery.soc = 2;
    // at 8 kW: 0.96
    expect(battery.applyPower(8, 1).energyKWh).toBeCloseTo(7.68, 12);
  });

  it('uses the power dependent discharge efficiency curve', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      min_soc_kwh: 0,
      max_discharge_power_kw: 8,
      discharge_efficiency: 0.9,
      discharge_efficiency_curve: [
        { up_to_kw: 0.5, efficiency: 1 },
        { up_to_kw: 8, efficiency: 0.96 },
      ],
    });

    // at 0.5 kW: no losses
    expect(battery.applyPower(-0.5, 1).energyKWh).toBeCloseTo(-0.5, 12);
    battery.soc = 8;
    // at 4 kW: interpolated efficiency 0.98133
    expect(battery.applyPower(-4, 1).energyKWh).toBeCloseTo(
      -4 / (1 - (3.5 / 7.5) * 0.04),
      12
    );
  });

  it('delays the full moment when charging with losses', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      max_charge_power_kw: 4,
      charge_efficiency: 0.5,
    });

    const result = battery.applyPower(4, 1);

    // SOC gain rate = 4 kW * 0.5 = 2 kW => 2 kWh missing take 1 hour
    expect(result.reachedFullAtHours).toBeCloseTo(1, 12);
    expect(result.actualDurationHours).toBeCloseTo(1, 12);
    expect(result.socAtEndKWh).toBeCloseTo(10, 12);
    expect(result.chargeLossKwh).toBeCloseTo(2, 12);
  });

  it('reaches the minimum SOC earlier when discharging with losses', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 3,
      min_soc_kwh: 1,
      max_discharge_power_kw: 4,
      discharge_efficiency: 0.5,
    });

    const result = battery.applyPower(-4, 1);

    // SOC draw rate = 4 / 0.5 = 8 kW => 2 kWh available last 0.25 h
    expect(result.reachedEmptyAtHours).toBeCloseTo(0.25, 12);
    expect(result.socAtEndKWh).toBeCloseTo(1, 12);
    // only 4 kW * 0.25 h = 1 kWh delivered externally
    expect(result.externalEnergyKwh).toBeCloseTo(-1, 12);
  });

  it('defaults to loss-free behavior when no efficiencies are configured', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      max_charge_power_kw: 5,
    });

    const result = battery.applyPower(4, 0.5);

    expect(result.efficiency).toBeCloseTo(1, 12);
    expect(result.energyKWh).toBeCloseTo(2, 12);
    expect(result.externalEnergyKwh).toBeCloseTo(2, 12);
    expect(result.chargeLossKwh).toBeCloseTo(0, 12);
    expect(result.dischargeLossKwh).toBeCloseTo(0, 12);
  });

  it('keeps boundary behavior when the battery is already full or empty', () => {
    const full = new Battery({
      capacity_kwh: 10,
      soc_kwh: 10,
      max_charge_power_kw: 5,
      charge_efficiency: 0.9,
    });
    expect(full.applyPower(5, 1)).toMatchObject({
      energyKWh: 0,
      reachedFullAtHours: 0,
    });

    const empty = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      min_soc_kwh: 2,
      max_discharge_power_kw: 5,
      discharge_efficiency: 0.9,
    });
    expect(empty.applyPower(-5, 1)).toMatchObject({
      energyKWh: 0,
      reachedEmptyAtHours: 0,
    });
  });

  it('loses energy over a charge/discharge round trip', () => {
    const battery = new Battery({
      capacity_kwh: 20,
      soc_kwh: 5,
      min_soc_kwh: 0,
      max_charge_power_kw: 4,
      max_discharge_power_kw: 4,
      charge_efficiency: 0.9,
      discharge_efficiency: 0.9,
    });

    battery.applyPower(4, 1); // SOC: 5 + 3.6 = 8.6
    const result = battery.applyPower(-4, 1); // SOC: 8.6 - 4/0.9 = 4.156

    expect(battery.soc).toBeCloseTo(5 + 4 * 0.9 - 4 / 0.9, 12);
    expect(result.externalEnergyKwh).toBeCloseTo(-4, 12);
  });
});
