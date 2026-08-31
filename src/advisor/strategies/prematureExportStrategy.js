import { Action } from '../action.js'
import { ActionProposal } from '../action-proposal.js'
import { Strategy } from '../strategy.js'

const DEFAULT_MAX_EXPORT_POWER_KW = 7.46
const DEFAULT_INTERVAL_MINUTES = 15

/**
 * Plans premature exports so that energy that would otherwise be exported
 * during negative-price periods can be exported during earlier periods with
 * a non-negative import price.
 */
export class PrematureExportStrategy extends Strategy {
  constructor({
    maxExportPowerKw = DEFAULT_MAX_EXPORT_POWER_KW,
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    priority = 50,
  } = {}) {
    super()
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw')
    validatePositive(intervalMinutes, 'intervalMinutes')
    this.maxExportPowerKw = maxExportPowerKw
    this.intervalMinutes = intervalMinutes
    this.priority = priority
  }

  get id() {
    return 'premature-export'
  }

  createPlan(timeSeries, options = {}) {
    if (!Array.isArray(timeSeries)) throw new Error('timeSeries must be an array')

    const maxExportPowerKw = options.maxExportPowerKw ?? this.maxExportPowerKw
    const intervalMinutes = options.intervalMinutes ?? this.intervalMinutes
    const priority = options.priority ?? this.priority
    validatePositiveOrZero(maxExportPowerKw, 'maxExportPowerKw')
    validatePositive(intervalMinutes, 'intervalMinutes')

    const intervalHours = intervalMinutes / 60
    let remainingExportEnergyKwh = 0
    const proposals = []

    for (let index = timeSeries.length - 1; index >= 0; index -= 1) {
      const timestep = timeSeries[index]
      const values = timestep.values ?? {}
      const importPricePerKwh = Number(values.importPrice ?? timestep.importPrice ?? 0)
      const gridTargetPowerKw = Number(values.gridTargetPowerKw ?? values.gridTarget ?? timestep.gridTarget ?? 0)
      const exportedEnergyKwh = Number(
        values.grid_export_kwh ?? values.exportedEnergyKwh ?? timestep.exportedEnergyKwh ?? timestep.exportedEnergy ?? 0
      )

      if (importPricePerKwh < 0) {
        const allowedExportEnergyKwh = Math.max(0, -gridTargetPowerKw) * intervalHours
        remainingExportEnergyKwh += Math.max(0, exportedEnergyKwh - allowedExportEnergyKwh)
        continue
      }

      if (remainingExportEnergyKwh <= 0) continue

      const actionEnergyKwh = Math.min(
        remainingExportEnergyKwh,
        maxExportPowerKw * intervalHours
      )
      if (actionEnergyKwh <= 0) continue

      proposals.push(
        new ActionProposal({
          strategyId: this.id,
          action: new Action({
            timestamp: new Date(timestep.start).toISOString(),
            durationMs: getDurationMs(timestep, intervalMinutes),
            component: 'grid',
            type: 'export-energy',
            energyKwh: actionEnergyKwh,
            powerKw: maxExportPowerKw,
            reason: 'AVOID_NEGATIVE_EXPORT_PRICE',
            expectedBenefit: {
              type: 'avoided-negative-price-export',
              estimatedEnergyKwh: actionEnergyKwh,
            },
            priority,
            confidence: 1,
            resource: 'grid-export',
            exclusive: true,
          }),
        })
      )

      remainingExportEnergyKwh = Math.max(0, remainingExportEnergyKwh - actionEnergyKwh)
    }

    return {
      strategyId: this.id,
      proposals,
      remainingExportEnergyKwh,
      totalPlannedExportEnergyKwh: proposals.reduce(
        (sum, proposal) => sum + proposal.action.energyKwh,
        0
      ),
    }
  }
}

function getDurationMs(timestep, intervalMinutes) {
  if (Number.isFinite(timestep.durationMs) && timestep.durationMs > 0) return timestep.durationMs
  const durationMs = new Date(timestep.end).getTime() - new Date(timestep.start).getTime()
  return durationMs > 0 ? durationMs : intervalMinutes * 60 * 1000
}

function validatePositiveOrZero(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number`)
}

function validatePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`)
}
