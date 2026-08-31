import { assert } from 'vitest';

export function defaultSimpleTestSettingsForPartialStepFixture(
  extraStateValues,
  extraTimestepValues
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
    components: makeComponents({}),
  };
}

export function defaultSimpleTestSettingsForFullStepFixture(
  extraStateValues,
  extraTimestepValues
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
    components: makeComponents({}),
  };
}

export function expectStandardNextStateAttributesPresent(timestep) {
  // isFinite verifies, that the attribute is defined, a number and not Infinity or NaN
  assert.isFinite(timestep.exportedEnergyKwh);
  assert.isFinite(timestep.importedEnergyKwh);
  assert.isFinite(timestep.missedProductionEnergyKwh);
  assert.isFinite(timestep.extraConsumedEnergyKwh);
  assert.isFinite(timestep.prematureExportPowerKw);
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
  min_soc_kwh = 0,
} = {}) {
  return {
    battery: {
      capacity_kwh,
      max_charge_power_kw: max_charge_kw,
      max_discharge_power_kw: max_discharge_kw,
      charge_efficiency,
      discharge_efficiency,
      min_soc_kwh,
    },
    grid: {
      max_export_power_kw: max_export_kw,
    },
  };
}
