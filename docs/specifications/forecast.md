# Forecast specification

Purpose: define the external input of the ForecastEngine and the TimeSeries it produces for downstream consumers such as the Advisor.

## Inputs

The input object contains:

- `intervals`: ordered array of non-overlapping forecast intervals
- `state`: optional current simulation state
  - `state.batteryEnergyKwh`: current battery energy in kWh; takes precedence over the configured battery `soc_kwh`
- `components`: optional simulation components (battery, grid, etc.)

Each forecast interval contains only external forecasts and constraints:

- `start`: interval start timestamp
- `end`: interval end timestamp
- `solar.productionPowerKw`: expected PV production power in kW
- `load.consumptionPowerKw`: expected normal consumption power in kW
- `load.extraPowerKw`: optional additional consumption power in kW
- `load.extraEndsAt`: optional end timestamp for the additional consumption
- `grid.targetPowerKw`: desired grid exchange in kW (`< 0` export, `0` neutral, `> 0` import)
- `grid.buyPerKwh`: electricity purchase price per kWh
- `grid.sellPerKwh`: electricity selling price per kWh

A forecast interval intentionally has no `battery.energyKwh`. Calculating the battery energy for every timestep is a responsibility of the ForecastEngine. Only the initial battery energy is supplied once through `state.batteryEnergyKwh`.

Power values are passed to the simulation in kW. Energy values are calculated by the simulation from the interval duration.

## Outputs

The ForecastEngine returns a TimeSeries containing one result per input interval. The result is grouped by the component where values occur and is directly consumable by the Advisor:

```js
{
  start,
  end,
  durationMs,
  solar: {
    productionPowerKw,
    missedProductionKwh
  },
  load: {
    consumptionPowerKw,
    extraConsumptionKwh
  },
  battery: {
    energyKwh,
    chargeKwh,
    dischargeKwh
  },
  grid: {
    targetPowerKw,
    importKwh,
    exportKwh,
    buyPerKwh,
    sellPerKwh
  },
  economics: {
    cost,
    revenue
  }
}
```

`battery.energyKwh` is the battery energy at the end of the interval. `battery.chargeKwh` and `battery.dischargeKwh` describe the energy charged or discharged during the interval.

The ForecastEngine does not emit a `values` wrapper. It also does not expose `prematureExportPowerKw`; premature export is an Advisor decision represented by an Action, not a forecast input.

## Rationale

The external Forecast input contains causes and constraints. The Forecast output additionally contains calculated states and results. Grouping data under `solar`, `load`, `battery`, `grid`, and `economics` makes ownership explicit and lets the Advisor consume the Forecast TimeSeries without renaming fields or converting units.
