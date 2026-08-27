import { createIntervals } from "../../src/time-series/timeSeries.js"
import { ForecastEngine } from "../../src/simulation/forecastEngine.js"

import { describe, it, expect } from "vitest"

describe("time-series and forecast basic", () => {
  it("creates intervals and runs forecast without battery", () => {
    const intervals = createIntervals({ startISO: "2026-01-01T00:00:00Z", periods: 4 })
    intervals[0].values = { consumption_kwh: 1, pv_kwh: 0 }
    intervals[1].values = { consumption_kwh: 1, pv_kwh: 2 }
    intervals[2].values = { consumption_kwh: 1, pv_kwh: 0 }
    intervals[3].values = { consumption_kwh: 1, pv_kwh: 0 }

    const forecast = ForecastEngine.run({ intervals, components: {} })
    expect(forecast.length).toBe(4)
    expect(forecast[1].values.grid_export_kwh).toBeGreaterThanOrEqual(0)
  })
})
