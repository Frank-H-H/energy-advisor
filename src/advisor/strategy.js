/**
 * Strategy contract for energy optimization.
 *
 * A strategy receives an ordered list of simulation intervals and returns
 * a new list with its optimization/countermeasure fields applied.
 */
export class Strategy {
  /**
   * @param {Array<object>} simulationIntervals
   * @param {object} [options]
   * @returns {Array<object>}
   */
  run(simulationIntervals, options = {}) {
    throw new Error('Strategy.run() must be implemented by a concrete strategy')
  }
}
