// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyAdvisorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const coreUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'src', 'index.js')
    ).href;

    node.on('input', async function (msg) {
      try {
        const core = await import(coreUrl);
        const timeSeries = msg.timeSeries || msg.payload;
        if (!Array.isArray(timeSeries)) {
          node.error(
            'Invalid input: msg.timeSeries or msg.payload must be an array'
          );
          return;
        }

        const strategyIds = (config.strategies || 'premature-export')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);

        const strategies = strategyIds.map((id) => {
          switch (id) {
            case 'premature-export':
              return new core.PrematureExportStrategy({
                maxExportPowerKw:
                  config.maxExportPowerKw === '' ||
                  config.maxExportPowerKw === undefined
                    ? 7.46
                    : Number(config.maxExportPowerKw),
                intervalMinutes:
                  config.intervalMinutes === '' ||
                  config.intervalMinutes === undefined
                    ? 15
                    : Number(config.intervalMinutes),
                priority:
                  config.priority === '' || config.priority === undefined
                    ? 50
                    : Number(config.priority),
              });
            default:
              throw new Error(`Unknown advisor strategy: ${id}`);
          }
        });

        const plan = core.AdvisorEngine.run({ timeSeries, strategies });
        msg.payload = plan;
        msg.plan = plan;
        node.send(msg);
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err));
      }
    });
  }

  RED.nodes.registerType('energy-advisor', EnergyAdvisorNode);
};
