# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
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
