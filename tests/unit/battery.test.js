import { Battery } from "../../src/components/battery.js"
import { describe, it, expect } from "vitest"

describe("Battery basic behavior", () => {
  it("respects capacity and SOC bounds", () => {
    const b = new Battery({ capacity_kwh: 10, soc_kwh: 9, min_soc_kwh: 0 })
    const res = b.charge(5)
    expect(b.soc).toBeLessThanOrEqual(b.capacity)
    const d = b.discharge(20)
    expect(b.soc).toBeGreaterThanOrEqual(b.minSoc)
  })
})
