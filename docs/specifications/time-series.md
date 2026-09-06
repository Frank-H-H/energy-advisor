# Energy TimeSeries Node

Purpose: create an empty TimeSeries with regular timesteps that can be enriched by forecast data and then passed to the Forecast node.

## Configuration

- `intervalMinutes`: `15` or `60` minutes
- `horizonHours`: positive whole number of hours

The start time is the current time rounded down to the selected interval.

## Output

The node preserves the incoming message and writes the generated series to `msg.payload.timeSeries`. Each timestep contains:

- `start`, `end`
- `solar.productionPowerKw = 0`
- `load.consumptionPowerKw = 0` and `load.extraLoads = []`
- `grid.targetPowerKw = 0`
- `grid.buyPerKwh`, `grid.sellPerKwh`, `grid.spotPerKwh` set to `null`

The node intentionally does not provide prices, PV forecasts, loads or device state. Those values can be supplied by other nodes before simulation.
