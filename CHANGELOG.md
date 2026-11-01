# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- Add `energy-timeseries` Node-RED helper node for creating simulation-ready TimeSeries.
- Support 15-minute and 60-minute intervals and configurable future horizons in hours.
- **Breaking:** Removed the fixed `charge_efficiency` and `discharge_efficiency` settings from the `energy-battery-config` node, the config schema and the domain model. Charge and discharge efficiencies are now configured exclusively via the power dependent efficiency curves.
- New battery config nodes now default to a charge and discharge efficiency of 97% from 0 kW upwards; existing flows without a usable stored curve fall back to the same default.

## 0.1.0 - Initial scaffold
- Project scaffold created
- Core domain model and time-series
- Simple battery model
- Forecast and advisor engines (representative scenario)
- Node-RED node skeletons
- Tests and CI
