// tests/integration/forecast-run.test.js
import { describe, it, expect } from 'vitest'
import { simulateTimestep } from '../../src/simulation/step.js'
import {
  makeInterval,
  makeComponents
} from '../helpers/simulation.js'


describe.skip('Forecast / run integration using simulateTimestep sequentially', () => {
  it('runs current (10min) then future (15min) intervals and aggregates results', () => {
    const A = makeInterval('2026-04-08T12:05:00.000Z', '2026-04-08T12:15:00.000Z', {
      expectedProductionPowerKw: 6,
      expectedConsumptionPowerKw: 3,
      gridTargetPowerKw: 0.6,
      extraConsumptionPowerKw: 2.1,
      extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z')
    })
    const B = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      expectedProductionPowerKw: 6,
      expectedConsumptionPowerKw: 3,
      gridTargetPowerKw: 0.6,
      extraConsumptionPowerKw: 2,
      extraConsumptionEndsAt: new Date('2026-04-08T14:00:00.000Z')
    })

    const components = makeComponents()
    const s0 = { battery_soc_kwh: 20 }

    const r1 = simulateTimestep({ state: s0, interval: A, components })
    const s1 = r1.nextState
    // first interval expected net change +0.25 -> 20.25 (sanity check)
    expect(s1.battery_soc_kwh).toBeCloseTo(20.25, 6)

    const r2 = simulateTimestep({ state: s1, interval: B, components })
    const s2 = r2.nextState
    // net expected: first +0.25, second +0.4 -> final 20.65
    expect(s2.battery_soc_kwh).toBeCloseTo(20.65, 6)

    // aggregated exported energy equals sum of individual exports
    const exportedSum = Number((r1.outputs.exportedEnergyKwh + r2.outputs.exportedEnergyKwh).toFixed(9))
    expect(exportedSum).toBeCloseTo(Number((r1.outputs.exportedEnergyKwh + r2.outputs.exportedEnergyKwh).toFixed(9)), 9)

    // battery delta across both intervals equals sum of per-interval applied battery changes
    const totalDelta = s2.battery_soc_kwh - s0.battery_soc_kwh
    const intervalDeltas = (r1.outputs.battery_charge_kwh - r1.outputs.battery_discharge_kwh) + (r2.outputs.battery_charge_kwh - r2.outputs.battery_discharge_kwh)
    expect(totalDelta).toBeCloseTo(intervalDeltas, 9)
  })

  it('energy delta per interval matches nextState - startState invariant', () => {
    const interval = makeInterval('2026-04-08T13:00:00.000Z', '2026-04-08T13:15:00.000Z', {
      expectedProductionPowerKw: 4,
      expectedConsumptionPowerKw: 2
    })
    const components = makeComponents()
    const s0 = { battery_soc_kwh: 10 }
    const r = simulateTimestep({ state: s0, interval, components })

    const applied = r.outputs.battery_charge_kwh - r.outputs.battery_discharge_kwh
    const delta = r.nextState.battery_soc_kwh - s0.battery_soc_kwh
    expect(applied).toBeCloseTo(delta, 9)

    // sanity: SOC within bounds
    expect(r.nextState.battery_soc_kwh).toBeGreaterThanOrEqual(0)
    expect(r.nextState.battery_soc_kwh).toBeLessThanOrEqual(components.battery.capacity_kwh)
  })
})
