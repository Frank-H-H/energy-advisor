import { Plan } from './plan.js'

/**
 * Combines proposals from all active strategies and resolves exclusive
 * resource conflicts. Higher priority wins; equal priorities are resolved
 * deterministically by strategy registration order.
 */
export class PlanBuilder {
  build(strategyPlans = []) {
    const proposals = strategyPlans.flatMap((plan) => plan.proposals ?? [])
    const ordered = proposals
      .map((proposal, index) => ({ proposal, index }))
      .sort((a, b) => {
        const priorityDiff = (b.proposal.action.priority ?? 0) - (a.proposal.action.priority ?? 0)
        return priorityDiff || a.index - b.index
      })

    const actions = []
    const rejectedProposals = []

    for (const { proposal } of ordered) {
      const conflict = actions.find((action) =>
        action.exclusive &&
        action.resource === proposal.action.resource &&
        overlaps(action, proposal.action)
      )

      if (conflict) {
        rejectedProposals.push({ proposal, reason: 'RESOURCE_CONFLICT' })
        continue
      }

      actions.push(proposal.action)
    }

    actions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    return new Plan({ actions, strategyPlans, rejectedProposals })
  }
}

function overlaps(a, b) {
  const aStart = new Date(a.timestamp).getTime()
  const bStart = new Date(b.timestamp).getTime()
  const aEnd = aStart + a.durationMs
  const bEnd = bStart + b.durationMs
  return aStart < bEnd && bStart < aEnd
}
