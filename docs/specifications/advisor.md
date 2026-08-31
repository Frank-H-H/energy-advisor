# Advisor specification

Purpose: analyze a simulation TimeSeries and produce a Plan containing actionable proposals for an external executor.

## Responsibilities

- The simulation produces the TimeSeries consumed by the Advisor.
- Multiple Strategies may be active at the same time.
- Each Strategy analyzes the same TimeSeries independently and creates a strategy plan containing ActionProposals.
- The Advisor combines all strategy plans into one Plan and resolves conflicts between proposals.
- The Advisor does not execute actions and does not modify the TimeSeries.
- Device control (for example changing a grid target, curtailing PV, charging/discharging a battery, or switching a device) happens outside this repository.

## Action

An Action is an instruction for an external executor. It uses explicit units where applicable:

- `timestamp` (ISO timestamp)
- `durationMs` (milliseconds)
- `component` (string)
- `type` (string)
- `energyKwh` (kWh, optional)
- `powerKw` (kW, optional)
- `reason` (machine-readable identifier)
- `expectedBenefit` (object, optional)
- `priority` (number)
- `confidence` (0..1)

Actions may declare a `resource`. Exclusive actions on the same resource must not overlap.

## ActionProposal

A Strategy does not directly decide the final Plan. It creates `ActionProposal` objects containing:

- `strategyId`
- `action`

The Advisor may accept or reject a proposal when consolidating plans.

## Plan

The final Plan contains:

- `actions`: accepted Actions, sorted chronologically
- `strategyPlans`: the results of all active Strategies
- `rejectedProposals`: proposals rejected during conflict resolution, including a machine-readable reason

The Plan is output only. No Action is executed by the Advisor.
