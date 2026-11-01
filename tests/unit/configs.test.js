import { describe, it, expect } from 'vitest'
import { mapConfigsToComponents } from '../../src/configs/schemas.js'

describe('config mapping', () => {
  it('maps default battery and grid inline configs correctly', () => {
    const sys = {
      battery: {
        capacity_kwh: 50,
        max_charge_power_kw: 5,
        max_discharge_power_kw: 4,
        idle_losses_kw: 0.1,
        charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.95 }]
      },
      grid: {
        max_export_power_kw: 6
      }
    }
    const comps = mapConfigsToComponents(sys.battery, sys.grid)
    expect(comps.battery.capacity_kwh).toBe(50)
    expect(comps.battery.max_charge_power_kw).toBe(5)
    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.95 }
    ])
    expect(comps.battery.idle_losses_kw).toBeCloseTo(0.1)
    expect(comps.grid.max_export_power_kw).toBe(6)
  })

  it('applies defaults when fields missing', () => {
    const comps = mapConfigsToComponents(null, null)
    // battery defaults to 0 capacity if not provided
    expect(typeof comps.battery.capacity_kwh).toBe('number')
    // efficiency curves default to 97% from 0 kW upwards
    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 }
    ])
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 }
    ])
    expect(comps.battery.idle_losses_kw).toBe(0)
  })

  it('ignores legacy scalar efficiency fields', () => {
    const comps = mapConfigsToComponents(
      { charge_efficiency: 0.5, discharge_efficiency: 0.6 },
      null
    )
    // scalar efficiencies are no longer mapped; the curve default applies
    expect(comps.battery.charge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 }
    ])
    expect(comps.battery.discharge_efficiency_curve).toEqual([
      { up_to_kw: 0, efficiency: 0.97 }
    ])
  })

  it('maps idle losses to the battery component', () => {
    const comps = mapConfigsToComponents({ idle_losses_kw: 0.15 }, null)
    expect(comps.battery.idle_losses_kw).toBeCloseTo(0.15)
  })

  it('accepts camelCase idleLossesKw alias', () => {
    const comps = mapConfigsToComponents({ idleLossesKw: 0.2 }, null)
    expect(comps.battery.idle_losses_kw).toBeCloseTo(0.2)
  })
})
