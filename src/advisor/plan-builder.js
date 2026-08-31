import { Plan } from './plan.js';

/**
 * Combines proposals from all active strategies. For the currently supported
 * action type, overlapping set-grid-target actions conflict. Higher priority
 * wins; equal priorities are resolved deterministically by proposal order.
 */
export class PlanBuilder {
  build(strategyPlans = []) {
    const proposals = strategyPlans.flatMap((plan) => plan.proposals ?? []);
    const ordered = proposals
      .map((proposal, index) => ({ proposal, index }))
      .sort((a, b) => {
        const priorityDiff = b.proposal.priority - a.proposal.priority;
        return priorityDiff || a.index - b.index;
      });

    const actions = [];
    const rejectedProposals = [];

    for (const { proposal } of ordered) {
      const conflict = actions.find((action) =>
        overlaps(action, proposal.action)
      );

      if (conflict) {
        rejectedProposals.push({ proposal, reason: 'ACTION_CONFLICT' });
        continue;
      }

      actions.push(proposal.action);
    }

    actions.sort((a, b) => a.start - b.start);
    return new Plan({ actions, strategyPlans, rejectedProposals });
  }
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}
