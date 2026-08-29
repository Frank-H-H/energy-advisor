// tests/unit/step-full-kwh.test.js
import { describe, it, expect } from 'vitest'
import { simulateTimestep } from '../../src/simulation/step.js'

function makeInterval(startISO, endISO, values = {}) {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return {
    start,
    end,
    durationMs: end.getTime() - start.getTime(),
    values
  }
}

function makeComponents({ capacity_kwh = 43.52, max_charge_kw = 8.7, max_export_kw = 7.46 } = {}) {
  return {
    battery: {
      capacity_kwh,
      max_charge_power_kw: max_charge_kw,
      max_discharge_power_kw: max_charge_kw,
      charge_efficiency: 1,
      discharge_efficiency: 1,
      min_soc_kwh: 0
    },
    grid: {
      max_export_power_kw: max_export_kw
    }
  }
}

describe('simulateTimestep - Full example (kWh message field names)', () => {
  it('current frame (partial 10 minutes) returns kWhInBatteryEnd = 20.25', () => {
    const interval = makeInterval('2026-04-08T12:05:00.000Z', '2026-04-08T12:15:00.000Z', {
      expectedProductionPower: 6,
      expectedConsumptionPower: 3,
      targetGridPoint: 0.6,
      extraConsumptionPower: 2.1,
      extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z')
    })
    const state = { battery_soc_kwh: 20 } // kWhInBatteryStart
    const components = makeComponents()

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(20.25, 6)
  })

  it('future frame (full 15 minutes) returns kWhInBatteryEnd = 20.4', () => {
    const interval = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      expectedProductionPower: 6,
      expectedConsumptionPower: 3,
      targetGridPoint: 0.6,
      extraConsumptionPower: 2,
      extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z')
    })
    const state = { battery_soc_kwh: 20 }
    const components = makeComponents()

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(20.4, 6)
  })
})
