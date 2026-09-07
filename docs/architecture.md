# Architecture

## Purpose

`energy-advisor` is split into a small domain/simulation core and thin Node-RED adapters.
The core is responsible for representing time-series data, simulating the energy system,
and creating executable advisor plans. The Node-RED nodes translate messages and node
configuration into these core APIs and back again.

The central design principle is:

> **Forecasting calculates what happens; the advisor proposes what should happen.**

A forecast may then be run again with an advisor `Plan` applied to the individual
forecast timesteps. This keeps decision making separate from simulation while still
allowing the two engines to be composed.

## High-level flow

The normal workflow is:

```text
                         input TimeSeries
                               │
                               ▼
                    ┌─────────────────────┐
                    │    ForecastEngine    │
                    │                     │
                    │  simulation model   │
                    │  + initial state    │
                    └─────────┬───────────┘
                              │
                              ▼
                    ForecastResult
                    ├── timeSeries
                    ├── summary
                    └── initialState
                              │
                              ▼
                    ┌─────────────────────┐
                    │     AdvisorEngine   │
                    │                     │
                    │     strategies      │
                    └─────────┬───────────┘
                              │
                              ▼
                            Plan
                              │
                              │ apply to matching
                              │ forecast timesteps
                              ▼
                    ┌─────────────────────┐
                    │    ForecastEngine   │
                    │       + Plan        │
                    └─────────┬───────────┘
                              │
                              ▼
                    forecast with planned actions
```

The advisor does **not** mutate the forecast or directly simulate the battery/grid.
It produces a `Plan`. The forecast engine remains the single place where the physical
simulation is executed.

## Core layers

```text
src/
├── domain/          Shared domain concepts and units
├── simulation/      Time-series handling and physical/economic simulation
├── components/      Simulation components such as battery and power balance
├── advisor/         Strategies, proposals and executable plans
├── infrastructure/  Shared errors and integration concerns
└── nodes/           Runtime adapters used by Node-RED

nodes/
├── energy-timeseries/   Build/prepare input time series
├── energy-forecast/     Run the forecast engine
├── energy-advisor/      Run advisor strategies and create a plan
├── energy-battery-config/ Configuration adapter for battery settings
└── energy-grid-config/    Configuration adapter for grid settings
```

### Domain

`src/domain` contains concepts that should not depend on Node-RED. Units and other
shared definitions live here so that the simulation and advisor use the same semantics.

### Simulation

`src/simulation` owns the time-series representation and the forecast calculation.
Important responsibilities include:

- converting input intervals into simulation timesteps,
- calculating timestep duration from `start` and `end`,
- applying configured extra loads,
- simulating battery/grid/power behaviour,
- mapping simulation results back to forecast intervals,
- calculating the forecast summary,
- mapping source time-series values onto forecast intervals.

The timestep duration is derived from the actual timestamps. A caller therefore does
not need to provide a separate global `intervalMinutes` value for forecast or advisor
logic.

### Components

`src/components` contains the building blocks used by the simulation, for example the
battery, power-balance calculations and timestep results.

Components operate on simulation data rather than Node-RED messages. This keeps the
physical model independently testable and reusable by other callers.

### Advisor

`src/advisor` contains the decision-making side of the application.

The flow inside the advisor is:

```text
TimeSeries
   │
   ▼
Strategy.createPlan(timeSeries)
   │
   ▼
ActionProposal[]
   │
   ▼
PlanBuilder
   │
   ▼
Plan
```

A strategy analyses the supplied forecast/simulation time series and proposes actions.
`AdvisorEngine` executes all configured strategies and combines their proposals through
`PlanBuilder`.

Strategies should remain independent of the simulation implementation. They consume
forecast data and describe intended actions; they do not directly change battery state
or grid flows.

### Plan

A `Plan` is the explicit boundary between decision making and execution.

Currently, plan actions use the `set-grid-target` action type. An action identifies its
target timestep through the exact `start` and `end` timestamps and supplies the desired
`gridTargetPowerKw`.

When a plan is passed to `ForecastEngine`, every action must match an existing forecast
timestep exactly. The forecast engine rejects actions that cannot be mapped to a timestep
rather than silently changing their timing.

This makes plans deterministic and prevents accidental application of an action to a
neighbouring interval.

## Forecast API

`ForecastEngine.run(input)` accepts the simulation input, including:

- `timeSeries`: the intervals to simulate,
- `components`: battery/grid and other simulation configuration,
- `initialState`: the starting simulation state,
- optional `plan`: actions to apply before simulation,
- optional forecast behaviour such as negative-spot-price handling.

It returns a `ForecastResult` with three main parts:

```text
ForecastResult
├── timeSeries   simulated intervals and their results
├── summary      aggregated economic, grid, solar and battery values
└── initialState original starting state used for the simulation
```

Keeping `initialState` with the result is intentional: a caller can use the same
starting state when re-running a forecast after applying an advisor plan.

## Time-series contract

A time-series interval is identified by `start` and `end`. The duration is always:

```text
end - start
```

rather than a separately configured interval length.

This is important for irregular time series and for daylight-saving-time transitions.
Operations that aggregate values over time must account for the actual duration of the
covered intervals where appropriate.

The time-series helpers therefore distinguish between:

- selecting a value for an exact/containing interval, and
- calculating duration-weighted values when a target interval spans multiple source
  intervals.

## Configuration boundary

Node-RED configuration nodes provide user-facing configuration objects. The core does
not depend on Node-RED configuration-node instances.

The runtime adapter maps these configuration objects to simulation components before
calling `ForecastEngine`:

```text
Node-RED config nodes
        │
        ▼
config/schema mapping
        │
        ▼
simulation components
        │
        ▼
ForecastEngine
```

This keeps Node-RED concerns at the edge of the application and allows the core API to
be used without a running Node-RED instance.

## Node-RED adapters

The files under `nodes/` are integration adapters rather than a second implementation
of the simulation or advisor logic.

Their responsibilities are deliberately small:

1. read node configuration and incoming messages,
2. validate/normalise the input required by the core,
3. call the corresponding core engine,
4. put the result back onto the Node-RED message.

For example, the forecast runtime resolves the core modules and maps optional battery/grid
configuration before calling `ForecastEngine.run()`.

The public behaviour of the Node-RED nodes should therefore be documented in terms of
the core contracts (`TimeSeries`, `ForecastResult`, `Plan`, etc.) rather than duplicating
the simulation rules in the node implementation.

## Separation of concerns

The architecture intentionally separates four concerns:

| Concern | Main responsibility |
| --- | --- |
| Time series | Represent and transform timestamped input data |
| Simulation | Calculate physical/economic consequences |
| Advisor | Decide which actions should be taken |
| Node-RED adapters | Connect the core to messages and UI configuration |

A useful rule when adding functionality is:

- If it changes **what physically happens**, it belongs in simulation/components.
- If it changes **which action should be proposed**, it belongs in advisor/strategies.
- If it changes **how a decision is executed**, it belongs in `Plan`/plan application.
- If it changes **how Node-RED users configure or connect the system**, it belongs in
  the node adapters/configuration layer.

## Error handling

Invalid contracts should fail at the boundary where they become meaningful. Examples:

- invalid or non-positive forecast timestep duration is rejected by forecast conversion,
- a plan without an `actions` array is rejected,
- unsupported plan action types are rejected,
- a plan action that does not exactly match a forecast timestep is rejected,
- non-finite grid target values are rejected.

The core should fail deterministically instead of silently repairing ambiguous input.

## Extension points

The main extension points are:

### New advisor strategies

Implement the strategy contract and return action proposals. The strategy should not
perform the physical simulation itself.

### New plan action types

Add a new action type together with validation and application semantics in the plan/
forecast boundary. The action must have an unambiguous mapping to simulation timesteps.

### New simulation components

Add the component to the simulation model and expose only the necessary configuration
through the component/config mapping layer.

### New Node-RED integrations

Add a thin adapter under `nodes/` and keep the actual domain behaviour in `src/`.

## Testing architecture

The test suite mirrors the separation above:

```text
unit tests
├── domain/helpers
├── components
├── simulation
└── advisor/strategies/plans

integration/scenario tests
└── Node-RED/core workflows such as
    TimeSeries → Forecast → Advisor → Plan → Forecast
```

The most important integration invariant is that an advisor plan can be produced from
one forecast and then applied to another forecast using the same timestep boundaries.
The physical result is always calculated by the forecast engine, not by the advisor.

## Documentation relationship

This document describes the architectural boundaries and data flow. The detailed
contracts remain in:

- `docs/specifications/time-series.md` — time-series semantics and transformations,
- `docs/specifications/forecast.md` — forecast input/output and simulation behaviour,
- `docs/specifications/advisor.md` — advisor strategies and plan generation,
- `docs/specifications/battery.md` — battery behaviour and constraints.

When a public data contract changes, the corresponding specification and Node-RED help
text should be updated together with the implementation and tests.
