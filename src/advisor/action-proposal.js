import { Action } from './action.js';

/** A strategy's proposal. The advisor may accept or reject it. */
export class ActionProposal {
  constructor({ strategyId, priority = 0, action }) {
    if (!strategyId) throw new Error('ActionProposal.strategyId is required');
    if (!Number.isFinite(priority))
      throw new Error('ActionProposal.priority must be a finite number');
    if (!(action instanceof Action))
      throw new Error('ActionProposal.action must be an Action');

    this.strategyId = strategyId;
    this.priority = priority;
    this.action = action;
  }
}
