import { assert } from 'vitest';

export function defaultSimpleTestSettingsForPartialStepFixture(
  extraStateValues,
  extraTimestepValues,
  extraComponentValues
) {
  return {
    state: makeState('2026-04-08T12:05:00.000Z', {
      batteryEnergyAtStartKwh: 20,
      ...extraStateValues,
    }),
    timestep: makeTimestep(
      '2026-04-08T12:00:00.000Z',
      '2026-04-08T12:15:00.000Z',
      { ...extraTimestepValues }
    ),
    components: makeComponents({ ...extraComponentValues }),
  };
}

export function defaultSimpleTestSettingsForFullStepFixture(
  extraStateValues,
  extraTimestepValues,
  extraComponentValues
) {
  return {
    state: makeState('2026-04-08T12:00:00.000Z', {
      batteryEnergyAtStartKwh: 20,
      ...extraStateValues,
    }),
    timestep: makeTimestep(
      '2026-04-08T13:00:00.000Z',
      '2026-04-08T13:15:00.000Z',
      { ...extraTimestepValues }
    ),
    components: makeComponents({ ...extraComponentValues }),
  };
}

export function expectStandardNextStateAttributesPresent(timestep) {
  // isFinite verifies, that the attribute is defined, a number and not Infinity or NaN
  assert.isFinite(timestep.exportedEnergyKwh);
  assert.isFinite(timestep.importedEnergyKwh);
  assert.isFinite(timestep.missedProductionEnergyKwh);
}

export function makeTimestep(startISO, endISO, values = {}) {
  const start = new Date(startISO);
  const end = new Date(endISO);

  return {
    start,
    end,
    ...values,
  };
}

export function makeState(currentTimeISO, values = {}) {
  const time = new Date(currentTimeISO);

  return {
    time,
    ...values,
  };
}

export function makeComponents({
  capacity_kwh = 43,
  max_charge_kw = 8,
  max_discharge_kw = max_charge_kw,
  max_export_kw = 7,
  charge_efficiency = 1,
  discharge_efficiency = 1,
  charge_efficiency_curve = null,
  discharge_efficiency_curve = null,
  min_soc_kwh = 0,
  idle_losses_kw = 0,
} = {}) {
  return {
    battery: {
      capacity_kwh,
      max_charge_power_kw: max_charge_kw,
      max_discharge_power_kw: max_discharge_kw,
      charge_efficiency,
      discharge_efficiency,
      charge_efficiency_curve,
      discharge_efficiency_curve,
      min_soc_kwh,
      idle_losses_kw,
    },
    grid: {
      max_export_power_kw: max_export_kw,
    },
  };
}
