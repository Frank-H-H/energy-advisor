/**
 * Base contract for energy optimization strategies.
 *
 * A strategy receives the TimeSeries produced by the simulation and creates
 * a strategy plan containing ActionProposals. It never changes the
 * TimeSeries and never executes an action.
 */
export class Strategy {
  get id() {
    throw new Error('Strategy.id must be implemented by a concrete strategy')
  }

  createPlan(_timeSeries, _options = {}) {
    throw new Error('Strategy.createPlan() must be implemented by a concrete strategy')
  }
}
