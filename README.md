# Energy Advisor

Current state: Still in the process of migrating my implementation based on multiple node-red subflows into a set of more generalized node implementations.

Be aware: This repo has been set up with the help of AI.

Migration tasks:

- [x] Setup repository
- [x] Add node for forecast
- [x] Add node for advisor strategies
- [x] Add configuration nodes for battery and grid
- [x] Add logic for single time step computation
- [x] Add tests for single time step computation
- [x] Add logic for iterating through the timesteps
- [x] Add tests for iterating
- [x] Add logic for Advisor Plans and Actions
- [x] Add tests for Advisor Plans and Actions
- [x] Have the algorithms use the config objects for battery, grid, etc.
- [x] Refactor! Introduce (or use existing) data objects like "Battery.charge(2)"
- [x] Support different Advisor Strategies
- [x] Run first test in my Home Assistant environment
- [x] Enable rerunning the forecast with the planned actions
- [x] Migrate from a single extra load to multiple extraLoads
- [x] Compute the total effects of the plans (total savings or so)
- [x] Introduce helper node to prepare a TimeSeries
- [ ] Add examples to documentation
- [ ] Add more strategies
- [ ] adapt node UI to make it better configurable
- [ ] Added charge and discharge efficiency as configuration options

[![CI](https://github.com/Frank-H-H/energy-advisor/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Frank-H-H/energy-advisor/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/Frank-H-H/energy-advisor/main.svg)](https://codecov.io/gh/Frank-H-H/energy-advisor)
[![npm version](https://img.shields.io/npm/v/energy-advisor.svg)](https://www.npmjs.com/package/energy-advisor)
[![License](https://img.shields.io/github/license/Frank-H-H/energy-advisor.svg)](LICENSE)

Decision-support library for residential energy systems: forecast and advisor engines with Node-RED adapters.

This repository contains:

- Core forecast and advisor engines (ESM) under `src/`
- Node-RED adapter nodes under `nodes/`
- Documentation and examples under `docs/`

## Energy TimeSeries Node

The `energy-timeseries` Node-RED node creates a simulation-ready `TimeSeries` for a configurable future horizon. Choose a 15-minute or 60-minute interval and the number of future hours. The generated series is written to `msg.payload.timeSeries`, with zero-valued solar/load/grid target fields. Optional fixed import/export prices can be configured. Spot prices can instead be read from a configurable message attribute containing time intervals and values.

A typical flow is:

```text
Energy TimeSeries -> Forecast -> Advisor -> Forecast
```

## Vision

The current Advisor implementation focuses on strategy-based planning. Currently supported actions:

- `set-grid-target`

The Advisor does not execute actions; execution remains the responsibility of the surrounding automation.



---

## Features

- Forecast engine to compute forecasts from consumption, PV, prices and grid targets.
  - Iterates through all provided timesteps and supports the TimeSeries resolution supplied by `energy-timeseries`.
  - Dynamically splitting timesteps (when battery gets full during a timestep, we can't just handle this as a single step)
- Advisor engine to create Plans from Strategy proposals. Currently supported actions: `set-grid-target`.
- Node-RED nodes for easy integration into flows:
  - `energy-timeseries` - create and enrich a simulation TimeSeries
  - `energy-forecast` - run forecast engine
  - `energy-advisor` - run Advisor strategies and produce a Plan
  - Config nodes: `energy-battery-config`, `energy-grid-config`

---

## Quickstart

Since in early development, energy-advisor has not yet been published in npm.

Prerequisites:

- Node.js 18+
- npm

Developer flow (recommended)

1. Clone the repo:
   git clone https://github.com/Frank-H-H/energy-advisor.git
   cd energy-advisor

2. Install dependencies:
   npm install

3. To run Node-RED using the local package (development mode):

   # From project root

   npm link

   # start Node-RED (my local windows machine)

   ```
   pm2 start ${HOME}/AppData/Roaming/npm/node_modules/node-red/red.js --name "node-red" --watch .
   ```

   or for debugging via visual studio code:

   ```
   node red
   ```

4. Run tests:
   npm test

---

## Contributing

- Fork & branch.
- Follow existing code style; run `npm run lint` before opening PRs.
- For Node-RED UI changes, test in an incognito browser after restarting Node-RED to avoid cached editor HTML.

---

## License

MIT - see LICENSE.
