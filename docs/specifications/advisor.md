# Advisor specification

Purpose: analyze a simulation TimeSeries and produce a Plan containing actionable proposals for an external executor.

## Responsibilities

- The simulation produces the TimeSeries consumed by the Advisor.
- Multiple Strategies may be active at the same time.
- Each Strategy analyzes the same TimeSeries independently and creates a strategy plan containing ActionProposals.
- The Advisor combines all strategy plans into one Plan and resolves conflicts between proposals.
- The Advisor does not execute actions and does not modify the TimeSeries.
- Device control happens outside this repository.

## TimeSeries

A Strategy consumes the TimeSeries produced by the ForecastEngine directly. A timestep is identified by its `start` and `end` timestamps and groups values by domain component:

- `solar.productionPowerKw`, `solar.missedProductionKwh`
- `load.consumptionPowerKw`, `load.extraLoads`
- `battery.energyKwh`, `battery.chargeKwh`, `battery.dischargeKwh`
- `grid.targetPowerKw`, `grid.importKwh`, `grid.exportKwh`, `grid.buyPerKwh`, `grid.sellPerKwh`
- `economics.cost`, `economics.revenue`

Strategies must not mutate the TimeSeries. Power values use `kW` in property names and energy values use `kWh`. The canonical grid target is `grid.targetPowerKw`: negative means export, zero means neither import nor export, and positive means import.

## Strategy

A Strategy analyzes a TimeSeries and creates a strategy plan. A Strategy does not execute Actions and does not modify the TimeSeries.

## Action

An Action is an instruction for an external executor. The currently supported Action type is `set-grid-target`.

It contains:

- `type` (`set-grid-target`)
- `start` (ISO-compatible timestamp)
- `end` (ISO-compatible timestamp)
- `gridTargetPowerKw` (kW; negative = export, positive = import)
- `reason` (optional machine-readable identifier)
- `expectedBenefit` (optional object)
- `confidence` (0..1)

The Action is only a description. It is not executed by the Advisor.

## ActionProposal

A Strategy does not directly decide the final Plan. It creates `ActionProposal` objects containing:

- `strategyId`
- `priority` (number; higher priority wins conflicts)
- `action`

The Advisor may accept or reject a proposal when consolidating plans.

## Plan

The final Plan contains:

- `actions`: accepted Actions, sorted chronologically
- `strategyPlans`: the results of all active Strategies
- `rejectedProposals`: proposals rejected during conflict resolution, including a machine-readable reason

The Plan is output only. No Action is executed by the Advisor.
