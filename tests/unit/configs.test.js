import { describe, it, expect } from 'vitest'
import { mapSystemConfigToComponents } from '../../src/configs/schemas.js'

describe('config mapping', () => {
  it('maps default battery and grid inline configs correctly', () => {
    const sys = {
      analysis_interval_minutes: 15,
      battery: {
        capacity_kwh: 50,
        max_charge_power_kw: 5,
        max_discharge_power_kw: 4,
        charge_efficiency: 0.95
      },
      grid: {
        max_export_power_kw: 6
      }
    }
    const comps = mapSystemConfigToComponents(sys, null, null)
    expect(comps.analysis.interval_minutes).toBe(15)
    expect(comps.battery.capacity_kwh).toBe(50)
    expect(comps.battery.max_charge_power_kw).toBe(5)
    expect(comps.battery.charge_efficiency).toBeCloseTo(0.95)
    expect(comps.grid.max_export_power_kw).toBe(6)
  })

  it('applies defaults when fields missing', () => {
    const comps = mapSystemConfigToComponents({ analysis_interval_minutes: 60 }, null, null)
    expect(comps.analysis.interval_minutes).toBe(60)
    // battery defaults to 0 capacity if not provided
    expect(typeof comps.battery.capacity_kwh).toBe('number')
    expect(comps.battery.charge_efficiency).toBeCloseTo(0.9)
  })
})