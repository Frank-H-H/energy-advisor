// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  const coreUrl = pathToFileURL(
    path.join(__dirname, '..', '..', 'src', 'index.js')
  ).href;

  // The ESM core is imported once and shared by the node runtime and the
  // editor endpoint below.
  const corePromise = import(coreUrl);

  // Serves the strategy descriptors for the node editor: the available
  // strategy types with their per-strategy configuration options.
  if (RED.httpAdmin && typeof RED.httpAdmin.get === 'function') {
    RED.httpAdmin.get('/energy-advisor/strategies', async (req, res) => {
      try {
        const core = await corePromise;
        res.json(core.getStrategyDescriptors());
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  function EnergyAdvisorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on('input', async function (msg) {
      try {
        const core = await corePromise;
        // Keep the forecast result intact and only add the generated Plan
        // separately. A subsequent forecast node can then reuse the
        // original timeSeries together with msg.plan.
        const timeSeries =
          msg.timeSeries || msg.payload?.timeSeries || msg.payload;
        if (!Array.isArray(timeSeries)) {
          node.error(
            'Invalid input: msg.timeSeries or msg.payload.timeSeries must be an array'
          );
          return;
        }

        // The order of the entries defines the order in which the
        // strategies are applied within every timestep. The legacy
        // comma-separated string (and the node-level battery config
        // reference of old flows) is migrated automatically.
        const strategyConfigs = core.normalizeStrategyConfigs(
          config.strategies,
          { legacyBatteryConfig: config.batteryConfig }
        );

        const strategies = core.createStrategies(strategyConfigs, {
          getBatteryConfig: (id) => (id ? RED.nodes.getNode(id) : null),
        });

        const plan = core.AdvisorEngine.run({ timeSeries, strategies });
        // Do not replace msg.payload: it contains the forecast/timeSeries
        // needed by a subsequent forecast node.
        msg.plan = plan;
        node.send(msg);
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err));
      }
    });
  }

  RED.nodes.registerType('energy-advisor', EnergyAdvisorNode);
};
