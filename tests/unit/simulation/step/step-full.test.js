// tests/unit/step-full.test.js
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

function makeComponents({ capacity_kwh = 43, max_charge_kw = 8, max_export_kw = 7 } = {}) {
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

describe('simulateTimestep - full example conversions from Node-RED flow', () => {
  it('current frame (time inside interval -> 10 minutes) computes expected SOC', () => {
    // Node-RED used message.time=12:05 within a 12:00-12:15 interval -> simulate 12:05-12:15 (10 minutes)
    const interval = makeInterval('2026-04-08T12:05:00.000Z', '2026-04-08T12:15:00.000Z', {
      expectedProductionPower: 6,
      expectedConsumptionPower: 3,
      targetGridPoint: 0.6,
      extraConsumptionPower: 2.1,
      extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z')
    })
    const state = { battery_soc_kwh: 20 }
    const components = makeComponents()

    const { nextState, outputs } = simulateTimestep({ state, interval, components })

    // Expectation computed in the flow comments: +1 -0.5 +0.1 -0.35 = +0.25
    expect(nextState.battery_soc_kwh).toBeCloseTo(20.25, 6)

    // also sanity-check component fields exist
    expect(outputs).toHaveProperty('exportedEnergy')
    expect(outputs).toHaveProperty('importedEnergy')
    expect(outputs).toHaveProperty('extraConsumedEnergy')
  })

  it('future frame (full 15 minutes) computes expected SOC', () => {
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

    // Expectation: +1.5 -0.75 +0.15 -0.5 = +0.4
    expect(nextState.battery_soc_kwh).toBeCloseTo(20.4, 6)
  })
})
