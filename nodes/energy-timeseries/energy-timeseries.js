// CommonJS Node-RED node that dynamically imports the ESM core.
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyTimeSeriesNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const intervalMinutes = Number(config.intervalMinutes ?? 15);
    const horizonHours = Number(config.horizonHours ?? 24);
    const coreUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'src', 'index.js')
    ).href;

    node.on('input', async function (msg) {
      try {
        const core = await import(coreUrl);
        const timeSeries = core.createTimeSeries({
          start: new Date(),
          intervalMinutes,
          horizonHours,
        });

        node.send({
          ...msg,
          payload: {
            ...(msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
              ? msg.payload
              : {}),
            timeSeries,
          },
        });
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err));
      }
    });
  }

  RED.nodes.registerType('energy-timeseries', EnergyTimeSeriesNode);
};
