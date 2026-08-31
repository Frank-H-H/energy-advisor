/** Final, consolidated advisor output. */
export class Plan {
  constructor({ actions = [], strategyPlans = [], rejectedProposals = [] } = {}) {
    this.actions = actions
    this.strategyPlans = strategyPlans
    this.rejectedProposals = rejectedProposals
  }
}
