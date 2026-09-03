import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"
import { ForecastEngine } from "../../src/simulation/forecastEngine.js"
import { AdvisorEngine } from "../../src/advisor/advisorEngine.js"

describe.skip("advisor scenario: create capacity before negative price", () => {
  it("produces a discharge recommendation before negative price interval", () => {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./fixtures/negative-price.json"), "utf8"))
    const forecast = ForecastEngine.run(fixture)
    const recs = AdvisorEngine.run({ timeSeries: forecast.timeSeries, components: fixture.components })
    expect(Array.isArray(recs)).toBe(true)
    expect(recs.length).toBeGreaterThan(0)
    const r = recs[0]
    expect(r.reason).toBe("CREATE_BATTERY_CAPACITY")
    expect(r.component).toBe("battery")
  })
})
