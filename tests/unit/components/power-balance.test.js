import { describe, expect, it } from 'vitest'
import { PowerBalance } from '../../../src/components/power-balance.js'

describe('PowerBalance domain model', () => {
  const start = new Date('2026-01-01T10:00:00Z')
  const beforeEnd = new Date('2026-01-01T10:30:00Z')
  const end = new Date('2026-01-01T11:00:00Z')

  it('calculates production minus consumption plus grid target', () => {
    const balance = PowerBalance.fromTimestep({
      productionPowerKw: 8,
      consumptionPowerKw: 3,
      gridTargetPowerKw: -1,
      start,
      end,
    })

    expect(balance.powerKw).toBe(4)
  })

  it('subtracts premature export power', () => {
    const balance = PowerBalance.fromTimestep({
      productionPowerKw: 8,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 0,
      prematureExportPowerKw: 2,
      start,
      end,
    })

    expect(balance.powerKw).toBe(3)
  })

  it('subtracts extra consumption while it is active', () => {
    const balance = PowerBalance.fromTimestep({
      productionPowerKw: 8,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 0,
      extraConsumptionPowerKw: 2,
      extraConsumptionEndsAt: beforeEnd,
      start,
      end,
    })

    expect(balance.powerKw).toBe(3)
  })

  it('does not subtract extra consumption after it has ended', () => {
    const balance = PowerBalance.fromTimestep({
      productionPowerKw: 8,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 0,
      extraConsumptionPowerKw: 2,
      extraConsumptionEndsAt: start,
      start,
      end,
    })

    expect(balance.powerKw).toBe(5)
  })

  it('returns a negative balance when consumption exceeds supply', () => {
    const balance = PowerBalance.fromTimestep({
      productionPowerKw: 2,
      consumptionPowerKw: 7,
      gridTargetPowerKw: 0,
      start,
      end,
    })

    expect(balance.powerKw).toBe(-5)
  })

  it('does not alter the timestep', () => {
    const timestep = {
      productionPowerKw: 8,
      consumptionPowerKw: 3,
      gridTargetPowerKw: 1,
      start,
      end,
    }
    const original = { ...timestep }

    PowerBalance.fromTimestep(timestep)

    expect(timestep).toEqual(original)
  })
})
