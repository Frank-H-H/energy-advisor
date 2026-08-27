# GitHub Copilot Instructions

This file explains how to safely and consistently extend the energy-advisor project using GitHub Copilot.

1. Project purpose
   - energy-advisor is a decision-support library for residential energy systems. It produces forecasts and recommendations; it does not control devices.

2. Architectural boundaries
   - Domain logic lives under src/ (domain, simulation, components, advisor).
   - Node-RED nodes are thin adapters in nodes/ and must not contain business logic.

3. Domain terminology
   - Forecast: a time series of expected system state (consumption, PV, prices, component state).
   - Recommendation: an immutable proposal describing an action, reason, expected benefit, etc.
   - Advisor: the module that analyzes forecasts and produces recommendations.

4. Units and time
   - Power: kW
   - Energy: kWh
   - Price: currency / kWh
   - Time: ISO 8601 timestamps normalized to UTC internally. Intervals are regular and defined in milliseconds.

5. Rules for Copilot sessions
   - Always inspect the relevant specification in docs/specifications before implementing features.
   - If specifications or tests are ambiguous, ask a human; do not invent behavior.
   - Business logic must remain independent of Node-RED.
   - Tests must accompany behavioral changes; prefer test-first.
   - Energy conservation is a critical invariant and must be tested.
   - Recommendations must never directly control external systems.

6. Tests and documentation
   - Tests are executable specifications. Update docs/specifications and tests together.

7. File/API conventions
   - Public API exports reside in src/index.js. Keep implementation details private.

8. When in doubt
   - Add an ADR under docs/decisions describing the assumption.
