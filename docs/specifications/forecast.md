# Forecast specification

Purpose: define the inputs and outputs for the ForecastEngine.

## Inputs

The input object contains:

- `intervals`: ordered array of non-overlapping intervals
- `state`: optional current simulation state
  - `state.batteryEnergyKwh`: current battery energy in kWh; takes precedence over the configured battery `soc_kwh`
- `components`: optional simulation components (battery, grid, etc.)

Each forecast interval contains the time range and logically grouped input data:

- `start`: interval start timestamp
- `end`: interval end timestamp
- `energy.productionPowerKw`: expected PV production power in kW
- `energy.consumptionPowerKw`: expected consumption power in kW
- `grid.targetPowerKw`: desired grid exchange in kW (`< 0` export, `0` neutral, `> 0` import)
- `price.buyPerKwh`: electricity purchase price per kWh
- `price.sellPerKwh`: electricity selling price per kWh
- `grid.prematureExportPowerKw`: optional additional export power in kW
- `loads.extraPowerKw`: optional additional consumption power in kW
- `loads.extraEndsAt`: optional end timestamp for the additional consumption

Power values are passed to the simulation in kW. The ForecastEngine no longer converts interval input energy values from kWh to kW. Energy values are calculated by the simulation from the interval duration.

## Outputs

The ForecastEngine returns one result per input interval. The result currently keeps the established `values` output structure and includes at least:

- `consumption_kwh` (kWh)
- `pv_kwh` (kWh)
- `battery_soc_kwh` (kWh)
- `battery_charge_kwh` (kWh)
- `battery_discharge_kwh` (kWh)
- `grid_import_kwh` (kWh)
- `grid_export_kwh` (kWh)
- `cost` (currency)
- `revenue` (currency)

## Rationale

The input model groups related data under `energy`, `grid`, `price`, and `loads`. Power values use the same terminology as the simulation and are passed directly in kW. There is no intermediate `values` object and no forecast-specific `pv_kwh`/`consumption_kwh` input conversion.
