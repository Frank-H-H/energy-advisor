// CommonJS Node-RED node that dynamically imports the ESM core.
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = function (RED) {
  function EnergyTimeSeriesNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const intervalMinutes = Number(config.intervalMinutes ?? 15);
    const horizonHours = Number(config.horizonHours ?? 24);
    const priceConfigs = {
      buyPerKwh: readPriceConfig(config, 'buy'),
      sellPerKwh: readPriceConfig(config, 'sell'),
      spotPerKwh: readPriceConfig(config, 'spot'),
    };
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

        const fixedPrices = {};
        for (const [gridField, priceConfig] of Object.entries(priceConfigs)) {
          if (priceConfig.sourceType === 'fixed') {
            fixedPrices[gridField] = priceConfig.value;
          }
        }
        if (Object.keys(fixedPrices).length > 0) {
          core.setGridPrices(timeSeries, fixedPrices);
        }

        for (const [gridField, priceConfig] of Object.entries(priceConfigs)) {
          if (priceConfig.sourceType === 'message') {
            const { entries, skipped } = core.extractTimeSeriesValues(msg, {
              path: priceConfig.path,
              startField: priceConfig.startField,
              endField: priceConfig.endField,
              valueField: priceConfig.valueField,
            });

            const result = core.applyTimeSeriesValues(
              timeSeries,
              entries,
              (timestep, value) => {
                timestep.grid[gridField] = value;
              }
            );

            if (skipped > 0) {
              node.warn(
                `Skipped ${skipped} invalid ${priceConfig.label} entries`
              );
            }
            if (result.missing > 0) {
              node.warn(
                `No ${priceConfig.label} found for ${result.missing} time-series interval(s)`
              );
            }
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

function readPriceConfig(config, prefix) {
  const sourceType = config[`${prefix}PriceSourceType`] ?? 'none';
  return {
    sourceType,
    value: parsePrice(config[`${prefix}PerKwh`]),
    path: config[`${prefix}PricePath`] ?? '',
    startField: config[`${prefix}PriceStartField`] ?? 'start',
    endField: config[`${prefix}PriceEndField`] ?? 'end',
    valueField: config[`${prefix}PriceValueField`] ?? 'value',
    label: priceLabel(prefix),
  };
}

function priceLabel(prefix) {
  return {
    buy: 'grid import price',
    sell: 'grid export price',
    spot: 'spot price',
  }[prefix] ?? 'price';
}

function parsePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Grid prices must be finite numbers or empty');
  }
  return number;
}
