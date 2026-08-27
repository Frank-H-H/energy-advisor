# Forecast specification

Purpose: define the inputs and outputs for the ForecastEngine.

Inputs:
- intervals: ordered array of regular intervals with start,end,durationMs and values object
  - values may include: consumption_kwh, pv_kwh, importPrice, exportPrice
- components: optional components (battery etc.)

Outputs (per interval): values include at least:
- consumption_kwh (kWh)
- pv_kwh (kWh)
- battery_soc_kwh (kWh)
- battery_charge_kwh (kWh)
- battery_discharge_kwh (kWh)
- grid_import_kwh (kWh)
- grid_export_kwh (kWh)
- cost (currency)
- revenue (currency)

Assumptions:
- intervals are regular and non-overlapping
- time is normalized to UTC internally
