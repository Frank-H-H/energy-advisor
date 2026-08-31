import { describe, expect, it } from 'vitest'
import { PrematureExportStrategy } from '../../src/advisor/strategies/prematureExportStrategy.js'

function frame(importPrice, exportedEnergy, gridTarget = 0) {
  return {
    importPrice,
    exportedEnergy,
    gridTarget,
  }
}

describe('PrematureExportStrategy', () => {
  it('moves excess export from a negative-price interval to an earlier interval', () => {
    const input = [
      frame(0.20, 0, 0),
      frame(-0.10, 2, -1),
    ]

    const result = new PrematureExportStrategy().run(input)

    expect(result.totalPlannedPrematureExports).toBeCloseTo(1.75, 10)
    expect(result.remainingEnergyToExport).toBe(0)
    expect(result.simulationIntervals[0].additionalExportPower).toBe(7.46)
    expect(result.simulationIntervals[0].extraEnergyToGetRidOf).toBeCloseTo(1.75, 10)
    expect(result.simulationIntervals[0].prematureExportPower).toBe(1.75)
    expect(result.simulationIntervals[0].remainingEnergyToExport).toBe(0)
    expect(result.simulationIntervals[1].prematureExportPower).toBe(0)
    expect(result.simulationIntervals[1].extraEnergyToGetRidOf).toBe(0)
  })

  it('does not move the part already covered by the target grid point', () => {
    const input = [
      frame(0.20, 0, 0),
      frame(-0.10, 2, -2),
    ]

    const result = new PrematureExportStrategy().run(input)

    expect(result.totalPlannedPrematureExports).toBe(1.5)
    expect(result.simulationIntervals[0].extraEnergyToGetRidOf).toBe(1.5)
  })

  it('uses multiple earlier intervals when one interval cannot absorb all energy', () => {
    const input = [
      frame(0.20, 0, 0),
      frame(0.30, 0, 0),
      frame(-0.10, 5, 0),
    ]

    const result = new PrematureExportStrategy().run(input)

    expect(result.totalPlannedPrematureExports).toBeCloseTo(3.73, 10)
    expect(result.remainingEnergyToExport).toBeCloseTo(1.27, 10)
    expect(result.simulationIntervals[0].extraEnergyToGetRidOf).toBeCloseTo(1.865, 10)
    expect(result.simulationIntervals[1].extraEnergyToGetRidOf).toBeCloseTo(1.865, 10)
  })

  it('does not mutate the input intervals', () => {
    const input = [
      frame(0.20, 0, 0),
      frame(-0.10, 2, -1),
    ]
    const original = JSON.parse(JSON.stringify(input))

    new PrematureExportStrategy().run(input)

    expect(input).toEqual(original)
  })

  it('supports forecast intervals with values', () => {
    const input = [
      {
        start: '2026-01-01T10:00:00Z',
        end: '2026-01-01T10:15:00Z',
        values: {
          importPrice: 0.20,
          gridTarget: 0,
          grid_export_kwh: 0,
        },
      },
      {
        start: '2026-01-01T10:15:00Z',
        end: '2026-01-01T10:30:00Z',
        values: {
          importPrice: -0.10,
          gridTarget: 0,
          grid_export_kwh: 2,
        },
      },
    ]

    const result = new PrematureExportStrategy().run(input)

    expect(result.simulationIntervals[0].values.extraEnergyToGetRidOf).toBe(1.865)
    expect(result.simulationIntervals[1].values.prematureExportPower).toBe(0)
  })

  it('allows the maximum export power and interval duration to be configured', () => {
    const input = [
      frame(0.20, 0, 0),
      frame(-0.10, 2, 0),
    ]

    const result = new PrematureExportStrategy({
      maxExportPowerKw: 4,
      intervalMinutes: 30,
    }).run(input)

    expect(result.simulationIntervals[0].additionalExportPower).toBe(4)
    expect(result.simulationIntervals[0].extraEnergyToGetRidOf).toBe(2)
    expect(result.totalPlannedPrematureExports).toBe(2)
  })
})
