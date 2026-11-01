import { ActionProposal } from './action-proposal.js'
import { Plan } from './plan.js'

/**
 * Runs all configured strategies against one simulation TimeSeries and
 * combines their proposals into one executable-by-another-system Plan.
 *
 * The engine walks the TimeSeries chronologically. For every timestep it
 * applies every strategy in the configured order. Accepted actions are
 * applied immediately to an internal working copy of the timestep, so a
 * strategy applied later in the order sees - and can build on - the results
 * of the strategies applied before it. There is no merge-at-the-end step;
 * the final Plan is the direct result of this sequential per-timestep pass.
 *
 * The caller's TimeSeries is never mutated.
 */
export class AdvisorEngine {
  static run({ timeSeries, strategies = [] } = {}) {
    if (!Array.isArray(timeSeries)) throw new Error('timeSeries must be an array')
    if (!Array.isArray(strategies)) throw new Error('strategies must be an array')

    strategies.forEach((strategy) => {
      if (!strategy || typeof strategy.planTimestep !== 'function') {
        throw new Error(
          'every strategy must implement planTimestep(timestep, context)'
        )
      }
    })

    const workingSeries = timeSeries.map(cloneTimestep)
    const strategyStates = strategies.map(() => ({}))
    const strategyPlans = strategies.map((strategy) => ({
      strategyId: strategy.id,
      proposals: [],
    }))

    const actions = []
    const rejectedProposals = []

    for (let index = 0; index < workingSeries.length; index += 1) {
      const timestep = workingSeries[index]
      // Actions accepted during this timestep's strategy pass compose;
      // they are not conflicts for the strategies applied afterwards.
      const currentTimestepActions = []

      for (let s = 0; s < strategies.length; s += 1) {
        const strategy = strategies[s]
        const context = {
          series: workingSeries,
          index,
          state: strategyStates[s],
        }

        const proposals = strategy.planTimestep(timestep, context) ?? []
        if (!Array.isArray(proposals)) {
          throw new Error(
            'Strategy.planTimestep() must return an array of ActionProposals'
          )
        }

        for (const proposal of proposals) {
          if (!(proposal instanceof ActionProposal)) {
            throw new Error(
              'Strategy.planTimestep() must return ActionProposal instances'
            )
          }

          // Proposals are accepted in the configured order. Within the
          // current timestep, proposals of later strategies intentionally
          // compose on top of the earlier ones. A proposal is only rejected
          // when it overlaps an action accepted for a different timestep.
          const conflict = actions.find(
            (action) =>
              overlaps(action, proposal.action) &&
              !currentTimestepActions.includes(action)
          )
          if (conflict) {
            rejectedProposals.push({ proposal, reason: 'ACTION_CONFLICT' })
            continue
          }

          actions.push(proposal.action)
          currentTimestepActions.push(proposal.action)
          strategyPlans[s].proposals.push(proposal)

          // Apply immediately so the next strategies (and timesteps)
          // operate on the updated working state.
          applyToTimestep(timestep, proposal.action)
        }
      }
    }

    strategies.forEach((strategy, s) => {
      const summary = strategy.summarizeRun?.(strategyStates[s])
      if (summary) Object.assign(strategyPlans[s], summary)
    })

    // Stable sort: within a timestep, actions keep the strategy order.
    actions.sort((a, b) => a.start - b.start)

    return new Plan({ actions, strategyPlans, rejectedProposals })
  }
}

function cloneTimestep(timestep) {
  const clone = { ...timestep }
  if (clone.grid) clone.grid = { ...clone.grid }
  return clone
}

/**
 * Applies an accepted action to the working copy of the timestep it
 * addresses. Actions that do not exactly match the current timestep are
 * recorded in the Plan but do not modify the working state.
 */
function applyToTimestep(timestep, action) {
  if (action.type !== 'set-grid-target') return
  if (action.start.getTime() !== new Date(timestep.start).getTime()) return
  if (action.end.getTime() !== new Date(timestep.end).getTime()) return
  if (!timestep.grid) timestep.grid = {}
  timestep.grid.targetPowerKw = action.gridTargetPowerKw
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end
}
