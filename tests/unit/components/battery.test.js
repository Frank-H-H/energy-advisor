import { describe, expect, it } from 'vitest';
import { Battery } from '../../../src/components/battery.js';

describe('Battery domain model', () => {
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
});
