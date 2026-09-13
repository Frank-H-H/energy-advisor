// tests/integration/forecast-run.test.js
import { describe, it, expect } from 'vitest'
import { simulateTimestep } from '../../src/simulation/timestep.js'
import { ForecastEngine } from '../../src/simulation/forecastEngine.js'
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js'
import { ImmediateNegativePriceExportStrategy } from '../../src/advisor/strategies/immediateNegativePriceExportStrategy.js'
import {
  makeInterval,
  makeComponents
} from '../helpers/simulation.js'



describe('Advisor to forecast integration', () => {
  it('creates a set-grid-target action and applies it to the forecast', () => {
    const components = makeComponents({
      capacity_kwh: 10,
      max_charge_kw: 10,
      max_discharge_kw: 10,
      max_export_kw: 10,
    })
    const input = {
      initialState: { batteryEnergyKwh: 10 },
      timeSeries: [
        {
          start: '2026-04-08T12:00:00.000Z',
          end: '2026-04-08T13:00:00.000Z',
          solar: { productionPowerKw: 0 },
          load: { consumptionPowerKw: 0 },
          grid: { targetPowerKw: 0, sellPerKwh: 0.1, spotPerKwh: 0.1 },
        },
        {
          start: '2026-04-08T13:00:00.000Z',
          end: '2026-04-08T14:00:00.000Z',
          solar: { productionPowerKw: 10 },
          load: { consumptionPowerKw: 0 },
          grid: { targetPowerKw: -2, sellPerKwh: 0.1, spotPerKwh: -0.1 },
        },
      ],
      components,
    }

    const baselineForecast = ForecastEngine.run(input)
    const plan = AdvisorEngine.run({
      timeSeries: baselineForecast.timeSeries,
      strategies: [new ImmediateNegativePriceExportStrategy()],
    })

    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({
      type: 'set-grid-target',
      gridTargetPowerKw: -6,
    })

    const forecastWithPlan = ForecastEngine.run({
      ...input,
      plan,
    })

    expect(forecastWithPlan.timeSeries.map((interval) => interval.grid.exportKwh))
      .toEqual([6, 2])
    expect(forecastWithPlan.timeSeries.map((interval) => interval.battery.energyKwh))
      .toEqual([4, 10])
  })
})
