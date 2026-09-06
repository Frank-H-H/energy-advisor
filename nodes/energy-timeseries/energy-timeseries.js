// CommonJS Node-RED node that dynamically imports the ESM core.
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyTimeSeriesNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const intervalMinutes = Number(config.intervalMinutes ?? 15);
    const horizonHours = Number(config.horizonHours ?? 24);
    const buyPerKwh = parsePrice(config.buyPerKwh);
    const sellPerKwh = parsePrice(config.sellPerKwh);
    const spotPriceSourceType = config.spotPriceSourceType ?? 'none';
    const spotPricePath = config.spotPricePath ?? 'payload.attributes.data';
    const spotPriceStartField = config.spotPriceStartField ?? 'start_time';
    const spotPriceEndField = config.spotPriceEndField ?? 'end_time';
    const spotPriceValueField = config.spotPriceValueField ?? 'price_per_kwh';
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

        core.setGridPrices(timeSeries, {
          buyPerKwh,
          sellPerKwh,
        });

        if (spotPriceSourceType === 'message') {
          const { entries, skipped } = core.extractTimeSeriesValues(msg, {
            path: spotPricePath,
            startField: spotPriceStartField,
            endField: spotPriceEndField,
            valueField: spotPriceValueField,
          });

          const result = core.applyTimeSeriesValues(timeSeries, entries, (timestep, value) => {
            timestep.grid.spotPerKwh = value;
          });

          if (skipped > 0) {
            node.warn(`Skipped ${skipped} invalid spot-price entries`);
          }
          if (result.missing > 0) {
            node.warn(`No spot price found for ${result.missing} time-series interval(s)`);
          }
        }

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

function parsePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Grid prices must be finite numbers or empty');
  }
  return number;
}
