# Advisor specification

Purpose: analyze a simulation TimeSeries and produce a Plan containing actionable proposals for an external executor.

## Responsibilities

- The simulation produces the TimeSeries consumed by the Advisor.
- Multiple Strategies may be active at the same time.
- The Advisor walks the TimeSeries timestep by timestep in chronological order and applies every configured Strategy to every timestep, in the configured order.
- Within a timestep, a Strategy sees the working state that the Strategies applied before it have already produced; its proposals build on that state (sequential composition).
- A proposal is rejected only when it overlaps an action accepted for a different timestep (`ACTION_CONFLICT`).
- The Advisor does not execute actions and does not modify the caller's TimeSeries; accepted actions are applied to an internal working copy only.
- Device control happens outside this repository.

## TimeSeries

A Strategy consumes the TimeSeries produced by the ForecastEngine directly. A timestep is identified by its `start` and `end` timestamps and groups values by domain component:

- `solar.productionPowerKw`, `solar.missedProductionKwh`
- `load.consumptionPowerKw`, `load.extraLoads`
- `battery.energyKwh`, `battery.chargeKwh`, `battery.dischargeKwh`
- `grid.targetPowerKw`, `grid.importKwh`, `grid.exportKwh`, `grid.buyPerKwh`, `grid.sellPerKwh`, `grid.spotPerKwh`
- `economics.cost`, `economics.revenue`

Strategies must not mutate the timestep passed to `planTimestep()`. Power values use `kW` in property names and energy values use `kWh`. The canonical grid target is `grid.targetPowerKw`: negative means export, zero means neither import nor export, and positive means import.

Timestep duration is always derived from each TimeSeries entry's `start` and `end` timestamps. Strategies must not define or use a separate interval setting for timestep duration. The TimeSeries is the source of truth, so a strategy must correctly handle TimeSeries entries with different durations.

## Strategy

A Strategy is applied once per timestep through `planTimestep(timestep, context)`:

- `timestep`: the current working state of the timestep (already modified by earlier strategies in the same timestep, if any).
- `context`: `{ series, index, state }` - the working copy of the whole TimeSeries, the index of the current timestep within it, and a run-scoped state object private to this strategy. The state may be used to precompute run-wide data (e.g. pending surpluses) and to carry information between timesteps.

It returns an array of `ActionProposal` objects for the current timestep (possibly empty). A Strategy does not execute Actions, does not modify the timestep it receives and never mutates the caller's TimeSeries.

After the timestep loop the Advisor calls the optional `summarizeRun(state)` hook. A Strategy may return summary fields there (e.g. energy totals); they are merged into its entry in `Plan.strategyPlans`.

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

When several strategies act on the same timestep, the Plan contains one Action per accepted proposal. Their `gridTargetPowerKw` values are absolute targets that already include the composition: the action of the second strategy in the configured order is calculated against the working target produced by the first. An external executor must therefore apply the actions of a timestep in Plan order (the Plan preserves the configured strategy order within a timestep).

## ActionProposal

A Strategy does not directly decide the final Plan. It creates `ActionProposal` objects containing:

- `strategyId`
- `action`

Within a timestep the configured strategy order governs the composition; the order in which the strategies are configured decides which strategy builds on which. The Advisor may still reject a proposal when it overlaps an action accepted for a different timestep.

## Plan

The final Plan contains:

- `actions`: accepted Actions, sorted chronologically (stable within equal start times: the configured strategy order is preserved)
- `strategyPlans`: the proposals (and optional summary fields) of all active Strategies
- `rejectedProposals`: proposals rejected because they overlapped actions of other timesteps, including a machine-readable reason

The Plan is output only. No Action is executed by the Advisor.

## Negative-price export strategies

The following strategies handle energy that would otherwise be exported during negative spot-price timesteps:

- `ImmediateNegativePriceExportStrategy` (`immediate-negative-price-export`): moves the required export to the nearest earlier non-negative-price timesteps. The pending surplus per timestep is precomputed once per run (backwards pass), so the timestep-wise application is equivalent to the previous whole-series backwards planning.
- `DistributedNegativePriceExportStrategy` (`distributed-negative-price-export`): distributes the required export energy across all earlier non-negative-price timesteps. It intentionally does not select timesteps by the highest spot price.

Both strategies use `grid.spotPerKwh` to detect negative-price periods. They produce `set-grid-target` ActionProposals and never modify the TimeSeries. Their `maxExportPowerKw` configuration caps the total export target of a timestep: when strategies applied earlier in the timestep already added export, a later strategy never plans beyond this maximum.

Configuration (both):

- `maxExportPowerKw` (optional, default 7.46): maximum export power in kW; caps the export target of a timestep.

## Battery minimum SOC strategy

`BatteryMinSocHoldStrategy` (`battery-min-soc-hold`) keeps the battery state of charge above a minimum level. It analyses the battery SOC trajectory of the TimeSeries (`battery.energyKwh`, the SOC at the end of each timestep) and plans grid imports at earlier timesteps whenever the SOC would drop below the configured minimum, so that the SOC never falls below it.

Configuration:

- `capacityKwh` (required): battery capacity in kWh.
- `minSocKwh` (optional): minimum SOC in kWh. Takes precedence over `minSocPercent`.
- `minSocPercent` (optional): minimum SOC as a fraction of the capacity (0..1). Defaults to 0.15 (15% of `capacityKwh`).
- `maxChargePowerKw` (required): maximum charge power in kW; caps the planned import of a timestep.
- `chargeEfficiencyCurve` (optional): power dependent charge efficiency curve. Without a curve charging is planned loss-free.

Planning model:

- Deficit timesteps (`battery.energyKwh` below the minimum at the end of the timestep) are processed chronologically. A timestep without `battery.energyKwh` is never a deficit timestep but may serve as a purchase timestep.
- Purchases are selected by ascending `grid.buyPerKwh` (ties: chronologically first). Timesteps without a buy price are used as a last resort.
- The required import of a purchase is derived from the required SOC gain and the charge efficiency at the resulting charge power (fixed point solution against the power dependent curve), so charge losses are included. `maxChargePowerKw` caps the import of a timestep; the remainder is bought at the next cheapest timestep.
- Purchases lift the SOC of all later timesteps additively, so a single purchase can cover several later deficits. The base trajectory is not re-simulated; capacity clamping of the lift is not modelled (purchases are sized to cover the deficit only).
- Hard guarantee: if even charging at full `maxChargePowerKw` in every available timestep cannot cover a deficit, the strategy buys as much as possible and reports the remainder in `summarizeRun()` as `uncoveredDeficitKwh`.

Actions: positive `set-grid-target` import additions on top of the existing target of the timestep. The strategy never modifies the TimeSeries. Summary fields: `minSocKwh`, `totalPlannedImportKwh`, `totalPlannedSocGainKwh`, `uncoveredDeficitKwh`.

## Node-RED node configuration

The `energy-advisor` Node-RED node is configured with a strategy editor instead of a comma-separated id list. The node stores the strategies as an ordered array of configuration entries, one entry per active strategy:

```json
"strategies": [
  { "type": "battery-min-soc-hold", "minSocPercent": 15, "batteryConfig": "<config node id>" },
  { "type": "distributed-negative-price-export", "maxExportPowerKw": 7.46 }
]
```

- The list order defines the order in which the strategies are applied within every timestep. Strategies can be added, removed and reordered in the editor.
- Each entry carries the options of its strategy: `maxExportPowerKw` for the negative-price export strategies; `minSocPercent` (in percent, default 15) and an `energy-battery-config` node reference for `battery-min-soc-hold`.
- The battery parameters (capacity, max charge power, charge efficiency curve) are read from the referenced `energy-battery-config` node. The `battery-min-soc-hold` strategy requires the reference; without it the node reports an error.
- The editor fetches the available strategy types and their options from the node's admin endpoint (`GET /energy-advisor/strategies`), which serves the strategy registry descriptors. New strategies only need to register themselves there.
- Migration: flows saved before the strategy editor keep working. The legacy comma-separated id string is normalized at runtime, and a node-level `batteryConfig` reference of old flows is used as the fallback for `battery-min-soc-hold` entries until the node is re-saved in the editor.

## Strategy registry

`src/advisor/strategyRegistry.js` is the single source of truth for the strategies available to the Node-RED node. Each entry provides:

- `id` and `label` for the editor,
- `options`: descriptors of the per-strategy configuration options (editor type, default, bounds),
- `create(config, ctx)`: a factory turning a stored configuration entry into a strategy instance; `ctx.getBatteryConfig(id)` resolves battery config node references.

The registry also normalizes the stored configuration (`normalizeStrategyConfigs`) including the legacy string migration and creates the strategy instances in the configured order (`createStrategies`).
