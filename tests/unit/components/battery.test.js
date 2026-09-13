import { describe, expect, it } from 'vitest';
import { Battery } from '../../../src/components/battery.js';

describe('Battery domain model', () => {

  it('respects capacity and SOC bounds', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 9,
      min_soc_kwh: 2,
    });

    expect(battery.soc).toBeLessThanOrEqual(battery.capacity);
    expect(battery.soc).toBeGreaterThanOrEqual(battery.minSoc);
  });

  it('clamps an initial SOC above capacity to capacity', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 12,
    });

    expect(battery.soc).toBe(10);
    expect(battery.availableCapacityKWh()).toBe(0);
    expect(battery.availableDischargeKWh()).toBe(10);
  });

  it('clamps an initial SOC below minimum SOC to minimum SOC', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 1,
      min_soc_kwh: 3,
    });

    expect(battery.soc).toBe(3);
    expect(battery.availableCapacityKWh()).toBe(7);
    expect(battery.availableDischargeKWh()).toBe(0);
  });

  it('defaults SOC and minimum SOC to zero and power limits to unlimited', () => {
    const battery = new Battery({ capacity_kwh: 10 });

    expect(battery.soc).toBe(0);
    expect(battery.minSoc).toBe(0);
    expect(battery.maxChargePower).toBe(Infinity);
    expect(battery.maxDischargePower).toBe(Infinity);
  });

  it('reports available charge and discharge energy from the current SOC', () => {
    const battery = new Battery({
      capacity_kwh: 12,
      soc_kwh: 5,
      min_soc_kwh: 2,
    });

    expect(battery.availableCapacityKWh()).toBe(7);
    expect(battery.availableDischargeKWh()).toBe(3);
  });

  it('keeps SOC at the exact boundary when charging an already full battery', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 10,
      max_charge_power_kw: 5,
    });

    const result = battery.applyPower(5, 1);

    expect(result.appliedPowerKw).toBe(5);
    expect(result.actualDurationHours).toBe(0);
    expect(result.energyKWh).toBe(0);
    expect(result.reachedFullAtHours).toBe(0);
    expect(result.socAtEndKWh).toBe(10);
    expect(battery.soc).toBe(10);
  });

  it('keeps SOC at the exact boundary when discharging an empty battery', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      min_soc_kwh: 2,
      max_discharge_power_kw: 5,
    });

    const result = battery.applyPower(-5, 1);

    expect(result.appliedPowerKw).toBe(-5);
    expect(result.actualDurationHours).toBe(0);
    expect(result.energyKWh).toBe(0);
    expect(Object.is(result.energyKWh, -0)).toBe(false);
    expect(result.reachedEmptyAtHours).toBe(0);
    expect(result.socAtEndKWh).toBe(2);
    expect(battery.soc).toBe(2);
  });

  it('does not change SOC for a zero-duration request', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 6,
      max_charge_power_kw: 5,
    });

    const result = battery.applyPower(5, 0);

    expect(result.appliedPowerKw).toBe(0);
    expect(result.actualDurationHours).toBe(0);
    expect(result.energyKWh).toBe(0);
    expect(result.socAtEndKWh).toBe(6);
    expect(battery.soc).toBe(6);
  });

  it('charges with the requested power for the requested duration', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      max_charge_power_kw: 5,
      max_discharge_power_kw: 5,
    });

    const result = battery.applyPower(4, 0.5);

    expect(result).toMatchObject({
      requestedPowerKw: 4,
      appliedPowerKw: 4,
      requestedDurationHours: 0.5,
      actualDurationHours: 0.5,
      energyKWh: 2,
      socAtStartKWh: 2,
      socAtEndKWh: 4,
      reachedFullAtHours: null,
      reachedEmptyAtHours: null,
    });
    expect(battery.soc).toBe(4);
  });

  it('limits charging to the configured maximum power', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      max_charge_power_kw: 3,
    });

    const result = battery.applyPower(5, 1);

    expect(result.appliedPowerKw).toBe(3);
    expect(result.actualDurationHours).toBe(1);
    expect(result.energyKWh).toBe(3);
    expect(result.socAtEndKWh).toBe(5);
  });

  it('reports fractional hours when the battery becomes full within a minute', () => {
    const battery = new Battery({
      capacity_kwh: 44,
      soc_kwh: 43.8,
      max_charge_power_kw: 7.2,
    });

    const result = battery.applyPower(7.2, 0.25);

    expect(result.reachedFullAtHours).toBeCloseTo(0.2 / 7.2, 12);
    expect(result.actualDurationHours).toBeCloseTo(0.2 / 7.2, 12);
    expect(result.socAtEndKWh).toBe(44);
  });

  it('stops charging when the battery becomes full', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      max_charge_power_kw: 4,
    });

    const result = battery.applyPower(4, 1);

    expect(result.appliedPowerKw).toBe(4);
    expect(result.actualDurationHours).toBe(0.5);
    expect(result.energyKWh).toBe(2);
    expect(result.socAtEndKWh).toBe(10);
    expect(result.reachedFullAtHours).toBe(0.5);
    expect(result.reachedEmptyAtHours).toBeNull();
  });

  it('discharges with negative power for the requested duration', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      min_soc_kwh: 2,
      max_discharge_power_kw: 4,
    });

    const result = battery.applyPower(-2, 1.5);

    expect(result).toMatchObject({
      requestedPowerKw: -2,
      appliedPowerKw: -2,
      requestedDurationHours: 1.5,
      actualDurationHours: 1.5,
      energyKWh: -3,
      socAtStartKWh: 8,
      socAtEndKWh: 5,
      reachedFullAtHours: null,
      reachedEmptyAtHours: null,
    });
    expect(battery.soc).toBe(5);
  });

  it('limits discharging to the configured maximum power', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      min_soc_kwh: 0,
      max_discharge_power_kw: 3,
    });

    const result = battery.applyPower(-5, 1);

    expect(result.appliedPowerKw).toBe(-3);
    expect(result.energyKWh).toBe(-3);
    expect(result.socAtEndKWh).toBe(5);
  });

  it('stops discharging when the battery reaches the minimum SOC', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 3,
      min_soc_kwh: 1,
      max_discharge_power_kw: 4,
    });

    const result = battery.applyPower(-4, 1);

    expect(result.actualDurationHours).toBe(0.5);
    expect(result.energyKWh).toBe(-2);
    expect(result.socAtEndKWh).toBe(1);
    expect(result.reachedEmptyAtHours).toBe(0.5);
    expect(result.reachedFullAtHours).toBeNull();
  });

  it('does not change the battery for zero power', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 4,
    });

    const result = battery.applyPower(0, 2);

    expect(result.appliedPowerKw).toBe(0);
    expect(result.actualDurationHours).toBe(2);
    expect(result.energyKWh).toBe(0);
    expect(result.socAtEndKWh).toBe(4);
    expect(battery.soc).toBe(4);
  });

  it('returns the actual duration when a power limit prevents the requested power', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 8,
      max_charge_power_kw: 2,
    });

    const result = battery.applyPower(4, 0.5);

    expect(result.appliedPowerKw).toBe(2);
    expect(result.actualDurationHours).toBe(0.5);
    expect(result.energyKWh).toBe(1);
    expect(result.socAtEndKWh).toBe(9);
  });

  it('rejects non-finite power and invalid durations', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 4,
    });

    expect(() => battery.applyPower(Number.NaN, 1)).toThrow(
      'powerKw must be finite'
    );

    expect(() => battery.applyPower(Infinity, 1)).toThrow(
      'powerKw must be finite'
    );

    expect(() => battery.applyPower(1, -1)).toThrow(
      'durationHours must be a finite number >= 0'
    );

    expect(() => battery.applyPower(1, Number.NaN)).toThrow(
      'durationHours must be a finite number >= 0'
    );
  });
  it('does not mutate SOC when a positive request starts at full capacity', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 10,
      max_charge_power_kw: 5,
    });

    const result = battery.applyPower(5, 0.5);

    expect(result.energyKWh).toBe(0);
    expect(result.actualDurationHours).toBe(0);
    expect(result.reachedFullAtHours).toBe(0);
    expect(battery.soc).toBe(10);
  });

  it('does not mutate SOC when a negative request starts at minimum SOC', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 2,
      min_soc_kwh: 2,
      max_discharge_power_kw: 5,
    });

    const result = battery.applyPower(-5, 0.5);

    expect(result.energyKWh).toBe(0);
    expect(result.actualDurationHours).toBe(0);
    expect(result.reachedEmptyAtHours).toBe(0);
    expect(battery.soc).toBe(2);
  });

  it('does not consume the requested duration when the battery hits full', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 9,
      max_charge_power_kw: 2,
    });

    const result = battery.applyPower(2, 1);

    expect(result.requestedDurationHours).toBe(1);
    expect(result.actualDurationHours).toBe(0.5);
    expect(result.energyKWh).toBe(1);
    expect(result.socAtEndKWh).toBe(10);
  });

  it('does not consume the requested duration when the battery hits minimum SOC', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 3,
      min_soc_kwh: 1,
      max_discharge_power_kw: 2,
    });

    const result = battery.applyPower(-2, 2);

    expect(result.requestedDurationHours).toBe(2);
    expect(result.actualDurationHours).toBe(1);
    expect(result.energyKWh).toBe(-2);
    expect(result.socAtEndKWh).toBe(1);
  });

  it('allows fractional durations and preserves the energy-power-duration relationship', () => {
    const battery = new Battery({
      capacity_kwh: 20,
      soc_kwh: 5,
      max_charge_power_kw: 8,
    });

    const result = battery.applyPower(6, 0.125);

    expect(result.appliedPowerKw * result.actualDurationHours).toBeCloseTo(
      result.energyKWh,
      12
    );
    expect(result.energyKWh).toBeCloseTo(0.75, 12);
    expect(result.socAtEndKWh).toBeCloseTo(5.75, 12);
  });

  it('rejects a non-finite duration of positive infinity', () => {
    const battery = new Battery({
      capacity_kwh: 10,
      soc_kwh: 4,
    });

    expect(() => battery.applyPower(1, Infinity)).toThrow(
      'durationHours must be a finite number >= 0'
    );
  });

});
