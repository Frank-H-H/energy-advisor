# Forecast specification

Purpose: define the external input of the ForecastEngine and the TimeSeries it produces for downstream consumers such as the Advisor.

## Inputs

The input object contains:

- `timeSeries`: ordered array of non-overlapping forecast timesteps
- `initialState`: optional current simulation state
  - `initialState.batteryEnergyKwh`: current battery energy in kWh; is the initial battery energy for the simulation
- `components`: optional simulation components (battery, grid, etc.)

Each forecast timestep contains only external forecasts and constraints:

- `start`: interval start timestamp
- `end`: interval end timestamp
- `solar.productionPowerKw`: expected PV production power in kW
- `load.consumptionPowerKw`: expected normal consumption power in kW
- `load.extraLoads`: optional array of additional consumers
  - `name`: optional name of the extra load
  - `consumptionPowerKw`: expected consumption power in kW
  - `start`: optional start timestamp; defaults to the containing interval's `start`
  - `end`: optional end timestamp; defaults to the containing interval's `end`
- `grid.targetPowerKw`: desired grid exchange in kW (`< 0` export, `0` neutral, `> 0` import)
- `grid.buyPerKwh`: electricity purchase price per kWh
- `grid.sellPerKwh`: electricity selling price per kWh

A forecast timestep intentionally has no `battery.energyKwh`. Calculating the battery energy for every timestep is a responsibility of the ForecastEngine. Only the initial battery energy is supplied once through `initialState.batteryEnergyKwh`.

Power values are passed to the simulation in kW. Energy values are calculated by the simulation from the interval duration.

## Outputs

The ForecastEngine returns a Forecast result containing the simulated `timeSeries`, an aggregated `summary`, and the original `initialState`. The result can be passed directly to the Advisor:

```js
{
  timeSeries: [
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
        extraLoads
      },
      battery: {
        energyKwh,
        chargeKwh,
        dischargeKwh,
        stateOfChargePercent
      },
      grid: {
        targetPowerKw,
        importKwh,
        exportKwh,
        buyPerKwh,
        sellPerKwh,
        spotPerKwh
      },
      economics: {
        cost,
        revenue
      }
    }
  ],
  summary: {
    economics: { cost, revenue, netCost },
    grid: { importKwh, exportKwh },
    solar: { productionKwh, missedProductionKwh },
    battery: { startEnergyKwh, endEnergyKwh }
  },
  initialState
}
```

`battery.energyKwh` is the battery energy at the end of the interval. `battery.chargeKwh` and `battery.dischargeKwh` describe the energy charged or discharged during the interval.

The ForecastEngine does not emit a `values` wrapper. Export decisions are represented by Advisor Actions, not forecast inputs. `grid.spotPerKwh` is preserved in each simulated timestep for downstream consumers such as the Advisor.

## Rationale

The external Forecast input contains causes and constraints. The Forecast output additionally contains calculated states and results. Grouping data under `solar`, `load`, `battery`, `grid`, and `economics` makes ownership explicit and lets the Advisor consume the Forecast TimeSeries without renaming fields or converting units.
