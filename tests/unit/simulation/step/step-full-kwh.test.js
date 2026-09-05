// tests/unit/step-full-kwh.test.js
import { describe, it, expect } from 'vitest'
import { simulateTimestep } from '../../../../src/simulation/step.js'
import {
  makeInterval,
  makeComponents
} from '../../../helpers/simulation.js'

describe.skip('simulateTimestep - Full example (kWh message field names)', () => {
  it('current frame (partial 10 minutes) returns kWhInBatteryEnd = 20.25', () => {
    const interval = makeInterval('2026-04-08T12:05:00.000Z', '2026-04-08T12:15:00.000Z', {
      productionPowerKw: 6,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 0.6,
      extraLoads: [{ name: 'test', consumptionPowerKw: 2.1, end: new Date('2026-04-08T14:00:00.000Z') }]
    })
    const state = { battery_soc_kwh: 20 } // kWhInBatteryStart
    const components = makeComponents()

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(20.25, 6)
  })

  it('future frame (full 15 minutes) returns kWhInBatteryEnd = 20.4', () => {
    const interval = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      productionPowerKw: 6,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 0.6,
      extraLoads: [{ name: 'test', consumptionPowerKw: 2, end: new Date('2026-04-08T14:00:00.000Z') }]
    })
    const state = { battery_soc_kwh: 20 }
    const components = makeComponents()

    const { nextState } = simulateTimestep({ state, interval, components })

    expect(nextState.battery_soc_kwh).toBeCloseTo(20.4, 6)
  })
})
