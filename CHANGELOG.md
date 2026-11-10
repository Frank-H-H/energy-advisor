# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- Add a hysteresis band to the `battery-min-soc-hold-efficient` strategy (`minSocHysteresisPercent`, default 2% of the capacity): new purchases are planned only when the SOC drops below the minimum, and a triggered purchase covers the SOC up to minimum + hysteresis. This prevents grid purchases from toggling on and off due to small SOC or forecast fluctuations.
- Add msg-sourced strategy options to the energy-advisor node: in the strategy editor, `Min SOC %` and `Hysteresis %` can be set to a fixed value or to a property path of the incoming message (typedInput type `msg.`). The values are resolved per message; missing or invalid msg values fall back to the fixed value or the default with a node warning and a yellow status.
- Rework the energy-advisor node configuration: strategies are managed in a strategy editor (add, remove, reorder by dragging) instead of a comma-separated ID list. Each strategy entry carries its own options: `maxExportPowerKw` for the negative-price export strategies, `minSocPercent` plus an `energy-battery-config` reference for `battery-min-soc-hold`. Existing flows keep working: the stored comma-separated list and the node-level battery config reference are migrated automatically at runtime and in the editor.
- Add a strategy registry (`src/advisor/strategyRegistry.js`) as the single source of truth for the strategies available to the Node-RED node, serving both the node editor (via `GET /energy-advisor/strategies`) and the node runtime.
- Add `minSocPercent` option to `BatteryMinSocHoldStrategy` (fraction 0..1, default 0.15); previously the minimum SOC was fixed at 15% of the capacity.
- **Breaking:** Removed the `priority` concept. The application order of the strategies is given by their order in the node configuration and within a timestep by the configured strategy order. `ActionProposal` no longer has a `priority` field, the strategies no longer accept a `priority` option and `PlanBuilder` resolves conflicts deterministically by proposal order (the earlier proposal wins).
- Add `battery-min-soc-hold` advisor strategy: keeps the battery SOC above a minimum (currently fixed at 15% of the capacity) by planning grid imports at the cheapest earlier timesteps, honouring the power dependent charge efficiency curve and the max charge power. The energy-advisor node gains a battery config reference for the battery parameters.
- Add `energy-timeseries` Node-RED helper node for creating simulation-ready TimeSeries.
- Support 15-minute and 60-minute intervals and configurable future horizons in hours.
- **Breaking:** Reworked the advisor processing model. `AdvisorEngine` now walks the TimeSeries timestep by timestep and applies every configured strategy to every timestep in the configured order, instead of running each strategy independently and merging the results at the end. Accepted actions are applied immediately to an internal working copy, so later strategies build on the results of earlier ones within a timestep. The caller's TimeSeries is never mutated.
- **Breaking:** The strategy contract changed from `createPlan(timeSeries)` to `planTimestep(timestep, context)` with an optional `summarizeRun(state)` hook for strategy-plan summaries.
- Within a timestep, proposals of multiple strategies now compose sequentially in the configured order; only proposals overlapping actions of other timesteps are rejected as `ACTION_CONFLICT`. `PlanBuilder` is no longer used by the engine and remains as a standalone utility.
- The negative-price export strategies keep their planning results unchanged when used alone. Their `maxExportPowerKw` now caps the total export target of a timestep when other strategies already added export in the same timestep.
- **Breaking:** Removed the fixed `charge_efficiency` and `discharge_efficiency` settings from the `energy-battery-config` node, the config schema and the domain model. Charge and discharge efficiencies are now configured exclusively via the power dependent efficiency curves.
- New battery config nodes now default to a charge and discharge efficiency of 97% from 0 kW upwards; existing flows without a usable stored curve fall back to the same default.

## 0.1.0 - Initial scaffold
- Project scaffold created
- Core domain model and time-series
- Simple battery model
- Forecast and advisor engines (representative scenario)
- Node-RED node skeletons
- Tests and CI
