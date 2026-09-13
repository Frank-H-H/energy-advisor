// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyForecastNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.battery_config = config.battery_config || '';
    node.grid_config = config.grid_config || '';

    // resolve file:// URL for the ESM module(s)
    const coreUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'src', 'index.js')
    ).href;
    const schemasUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'src', 'configs', 'schemas.js')
    ).href;

    node.on('input', async function (msg) {
      try {
        const inputField = config.inputField || 'payload';
        const input = msg[inputField];
        if (
          !input ||
          !Array.isArray(input.timeSeries)
        ) {
          node.error(
            'Invalid input: msg.' + inputField + '.timeSeries required (array)'
          );
          return;
        }

        let batteryConfigObject = null;
        let gridConfigObject = null;
        if (node.battery_config) {
          const batteryConfigNode = RED.nodes.getNode(node.battery_config);
          if (batteryConfigNode) {
            batteryConfigObject = {
              capacity_kwh: batteryConfigNode.capacity_kwh,
              max_charge_power_kw: batteryConfigNode.max_charge_power_kw,
              max_discharge_power_kw: batteryConfigNode.max_discharge_power_kw,
              charge_efficiency: batteryConfigNode.charge_efficiency,
              notes: batteryConfigNode.notes,
            };
          }
        }
        if (node.grid_config) {
          const gridConfigNode = RED.nodes.getNode(node.grid_config);
          if (gridConfigNode) {
            gridConfigObject = {
              max_export_power_kw: gridConfigNode.max_export_power_kw,
            };
          }
        }

        // dynamic import ESM core + mapping helper
        const core = await import(coreUrl);
        const schemas = await import(schemasUrl);
        const ForecastEngine = core.ForecastEngine;

        // prepare a copy of the input and attach components if we have config
        const inputCopy = {
          ...input,
          excludeNegativeSpotPriceRevenue:
            config.excludeNegativeSpotPriceRevenue !== false,
        };
        // The advisor node also exposes its Plan as msg.plan. Allow the
        // simulation to use that Plan even when the Forecast input itself
        // lives in another message property. An explicitly supplied
        // input.plan always wins.
        if (inputCopy.plan === undefined && msg.plan !== undefined) {
          inputCopy.plan = msg.plan;
        }
        // Allow the initial simulation state to be supplied as message metadata.
        if (inputCopy.initialState === undefined && msg.initialState !== undefined) {
          inputCopy.initialState = msg.initialState;
        }
        if (batteryConfigObject || gridConfigObject) {
          inputCopy.components = schemas.mapConfigsToComponents(
            batteryConfigObject || {},
            gridConfigObject || {}
          );
        }

        const forecast = ForecastEngine.run(inputCopy);
        // Keep the original message metadata (including top-level initialState)
        // while replacing only the payload with the forecast result.
        node.send({ ...msg, payload: forecast });
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err));
      }
    });
  }

  RED.nodes.registerType('energy-forecast', EnergyForecastNode);
};
