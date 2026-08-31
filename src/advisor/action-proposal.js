import { Action } from './action.js'

/** A strategy's proposal. The advisor may accept or reject it. */
export class ActionProposal {
  constructor({ strategyId, action }) {
    if (!strategyId) throw new Error('ActionProposal.strategyId is required')
    if (!(action instanceof Action)) throw new Error('ActionProposal.action must be an Action')
    this.strategyId = strategyId
    this.action = action
  }
}
