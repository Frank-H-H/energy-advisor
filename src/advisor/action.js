/**
 * A concrete action proposed by the advisor. Actions describe what an
 * external executor may do; they never execute the change themselves.
 */
export class Action {
  constructor({
    timestamp,
    durationMs,
    component,
    type,
    energyKwh,
    powerKw,
    reason,
    expectedBenefit,
    priority = 0,
    confidence = 0,
    resource,
    exclusive = true,
  }) {
    if (!timestamp) throw new Error('Action.timestamp is required')
    if (!component) throw new Error('Action.component is required')
    if (!type) throw new Error('Action.type is required')
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Action.durationMs must be a positive finite number')
    }
    if (energyKwh !== undefined && (!Number.isFinite(energyKwh) || energyKwh < 0)) {
      throw new Error('Action.energyKwh must be a non-negative finite number')
    }
    if (powerKw !== undefined && (!Number.isFinite(powerKw) || powerKw < 0)) {
      throw new Error('Action.powerKw must be a non-negative finite number')
    }

    this.timestamp = timestamp
    this.durationMs = durationMs
    this.component = component
    this.type = type
    if (energyKwh !== undefined) this.energyKwh = energyKwh
    if (powerKw !== undefined) this.powerKw = powerKw
    if (reason !== undefined) this.reason = reason
    if (expectedBenefit !== undefined) this.expectedBenefit = expectedBenefit
    this.priority = priority
    this.confidence = confidence
    this.resource = resource ?? component
    this.exclusive = exclusive
  }
}
