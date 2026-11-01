/**
 * Base contract for energy optimization strategies.
 *
 * The AdvisorEngine walks the TimeSeries timestep by timestep in
 * chronological order. For every timestep it calls every configured
 * strategy, in the configured order, via planTimestep(). A strategy
 * receives the current working state of the timestep - which strategies
 * applied earlier in the configured order may already have modified in the
 * same run - and returns proposals for that timestep.
 *
 * A strategy never executes an action and must not mutate the timestep
 * passed to planTimestep(). Accepted proposals are applied by the engine to
 * an internal working copy of the TimeSeries.
 */
export class Strategy {
  get id() {
    throw new Error('Strategy.id must be implemented by a concrete strategy')
  }

  /**
   * Plans the given timestep.
   *
   * @param {object} timestep current working state of the timestep
   * @param {object} context  run context: { series, index, state }.
   *   series is the working copy of the whole TimeSeries, index is the
   *   position of timestep within it and state is a run-scoped object that
   *   only this strategy sees and may use to carry data between timesteps.
   * @returns {Array} ActionProposals for this timestep (may be empty).
   */
  planTimestep(timestep, context) {
    throw new Error(
      'Strategy.planTimestep() must be implemented by a concrete strategy'
    )
  }

  /**
   * Optional hook. Called once after the timestep loop has finished, with
   * the run-scoped state object of this strategy. May return an object with
   * strategy-plan summary fields (e.g. energy totals); it is merged into
   * this strategy's entry in Plan.strategyPlans.
   */
  summarizeRun(state) {
    return undefined
  }
}
