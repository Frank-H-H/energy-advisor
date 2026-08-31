/**
 * An action in an advisor Plan. Actions are descriptions for an external
 * executor; the advisor never executes them.
 *
 * Currently the only supported action type is `set-grid-target`.
 */
export class Action {
  constructor({
    type,
    start,
    end,
    gridTargetPowerKw,
    reason,
    expectedBenefit,
    confidence = 0,
  }) {
    if (type !== 'set-grid-target') {
      throw new Error('Action.type must be set-grid-target');
    }
    if (!start) throw new Error('Action.start is required');
    if (!end) throw new Error('Action.end is required');

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('Action.start and Action.end must be valid dates');
    }
    if (startDate >= endDate)
      throw new Error('Action.start must be before Action.end');
    if (!Number.isFinite(gridTargetPowerKw)) {
      throw new Error('Action.gridTargetPowerKw must be a finite number');
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('Action.confidence must be between 0 and 1');
    }

    this.type = type;
    this.start = startDate;
    this.end = endDate;
    this.gridTargetPowerKw = gridTargetPowerKw;
    if (reason !== undefined) this.reason = reason;
    if (expectedBenefit !== undefined) this.expectedBenefit = expectedBenefit;
    this.confidence = confidence;
  }
}
