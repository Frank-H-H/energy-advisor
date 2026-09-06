# Energy TimeSeries Node

Purpose: create an empty TimeSeries with regular timesteps that can be enriched by forecast data and then passed to the Forecast node.

## Configuration

- `intervalMinutes`: `15` or `60` minutes
- `horizonHours`: positive whole number of hours
- `buyPerKwh`: optional fixed grid import price in currency per kWh
- `sellPerKwh`: optional fixed grid export remuneration in currency per kWh
- `spotPriceSourceType`: `none` or `message`
- `spotPricePath`: path to the array of time/value objects when using a message attribute
- `spotPriceStartField`, `spotPriceEndField`, `spotPriceValueField`: configurable fields inside each source object

The start time is the current time rounded down to the selected interval.

## Output

The node preserves the incoming message and writes the generated series to `msg.payload.timeSeries`. Each timestep contains:

- `start`, `end`
- `solar.productionPowerKw = 0`
- `load.consumptionPowerKw = 0` and `load.extraLoads = []`
- `grid.targetPowerKw = 0`
- `grid.buyPerKwh` and `grid.sellPerKwh` set to the configured fixed prices, or `null` when left empty
- `grid.spotPerKwh` is populated from the configured message attribute when spot-price mapping is enabled

The node intentionally does not assume a particular tariff. Import and export prices can be configured independently. Time-dependent values can be read from a message attribute using configurable start, end and value fields. For a target interval, an exact source interval is preferred; a containing larger interval is accepted; fully covering smaller intervals are averaged arithmetically. Incomplete coverage leaves the target value unset. PV forecasts, loads and device state can be supplied by other nodes before simulation.
