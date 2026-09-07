# Energy TimeSeries Node

Purpose: create an empty TimeSeries with regular timesteps that can be enriched by forecast data and then passed to the Forecast node.

## Configuration

- `intervalMinutes`: `15` or `60` minutes
- `horizonHours`: positive whole number of hours
- `gridTargetSourceType`: `none`, `fixed`, `message` or `dayNight`
- `gridTargetPowerKw`: fixed grid target power in kW when `gridTargetSourceType` is `fixed`
- `gridTargetPath`, `gridTargetStartField`, `gridTargetEndField`, `gridTargetValueField`: message mapping for grid target values
- `gridTargetDayStart`, `gridTargetDayEnd`: day period boundaries in `HH:mm` format
- `gridTargetDayPowerKw`, `gridTargetNightPowerKw`: separate day/night grid target powers in kW
- `buyPriceSourceType`: `none`, `fixed` or `message`
- `sellPriceSourceType`: `none`, `fixed` or `message`
- `spotPriceSourceType`: `none` or `message`
- `solarProductionSourceType`: `none` or `message`
- `loadConsumptionSourceType`: `none` or `message`
- `buyPerKwh`, `sellPerKwh`: fixed prices used when the corresponding source is `fixed`
- `buyPricePath`, `sellPricePath`, `spotPricePath`: message paths used when the corresponding source is `message`
- `buyPriceStartField`, `buyPriceEndField`, `buyPriceValueField`: configurable fields for grid import price entries
- `sellPriceStartField`, `sellPriceEndField`, `sellPriceValueField`: configurable fields for grid export price entries
- `spotPriceStartField`, `spotPriceEndField`, `spotPriceValueField`: configurable fields for spot-price entries
- `solarProductionPath`, `solarProductionStartField`, `solarProductionEndField`, `solarProductionValueField`: message mapping for expected PV production
- `loadConsumptionPath`, `loadConsumptionStartField`, `loadConsumptionEndField`, `loadConsumptionValueField`: message mapping for expected consumption
- `extraLoads`: one or more extra-load source definitions
  - message-array mode maps a message array using configurable path, start, end and power fields
  - current-load mode uses `msg.time` as the start, a configurable message power field in kW, and a configurable absolute end timestamp field

The start time is read from `msg.time` and rounded down to the selected interval.

## Time model

- Timestamps represent absolute points in time and should use an explicit timezone, preferably ISO 8601 with `Z` or a numeric offset.
- Day/night boundaries configured as `HH:mm` are interpreted in the local timezone of the Node-RED process. The node intentionally does not have a separate timezone setting.
- Consequently, the local timezone and daylight-saving rules of the Node-RED process determine which day/night target applies to a timestamp.

## Output

The node preserves the incoming message and writes the generated series to `msg.payload.timeSeries`. Each timestep contains:

- `start`, `end`
- `solar.productionPowerKw = 0` by default, or populated from the configured message attribute
- `load.consumptionPowerKw = 0` by default, or populated from the configured message attribute; `load.extraLoads = []`
- `grid.targetPowerKw = 0` by default, or populated from a fixed value, message attribute, or day/night configuration
- `grid.buyPerKwh` and `grid.sellPerKwh` are `null` for `none`, fixed for `fixed`, or populated from the configured message attribute for `message`
- `grid.spotPerKwh` is `null` for `none` or populated from the configured message attribute for `message`

The node intentionally does not assume a particular tariff. Import and export prices can be configured independently. Time-dependent prices, expected PV production and expected consumption can be read from message attributes using configurable start, end and value fields. For a target interval, an exact source interval is preferred; a containing larger interval is accepted; fully covering smaller intervals are combined using a duration-weighted average, so longer source intervals have proportionally more influence. Incomplete price coverage leaves the target price unset. Incomplete forecast coverage leaves expected PV production or consumption at zero and produces a warning. Extra loads can be configured from message data; current-load entries use `msg.time` as their start, a configurable power field in kW, and an absolute end timestamp from the configured message field.
