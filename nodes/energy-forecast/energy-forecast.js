// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyForecastNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // store selected system config id (empty string if none)
    node.systemConfigId = config.system_config || '';
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

        // Resolve system-config and referenced battery/grid config nodes (if any)
        let systemConfigObject = null;
        let batteryConfigObject = null;
        let gridConfigObject = null;
        if (node.systemConfigId) {
          const sysNode = RED.nodes.getNode(node.systemConfigId);
          if (sysNode) {
            // sysNode has properties we stored on creation: battery_config, grid_ref, analysis_interval_minutes
            systemConfigObject = {
              analysis_interval_minutes: sysNode.analysis_interval_minutes,
            };
          }
        }
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
        const inputCopy = { ...input };
        // The advisor node also exposes its Plan as msg.plan. Allow the
        // simulation to use that Plan even when the Forecast input itself
        // lives in another message property. An explicitly supplied
        // input.plan always wins.
        if (inputCopy.plan === undefined && msg.plan !== undefined) {
          inputCopy.plan = msg.plan;
        }
        if (systemConfigObject || batteryConfigObject || gridConfigObject) {
          inputCopy.components = schemas.mapSystemConfigToComponents(
            systemConfigObject || {},
            batteryConfigObject || {},
            gridConfigObject || {}
          );
        }

        const forecast = ForecastEngine.run(inputCopy);
        node.send({ payload: forecast });
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err));
      }
    });
  }

  RED.nodes.registerType('energy-forecast', EnergyForecastNode);
};
