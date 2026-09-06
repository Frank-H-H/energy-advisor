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
    const forecastConfigs = {
      productionPowerKw: readForecastConfig(config, 'solarProduction'),
      consumptionPowerKw: readForecastConfig(config, 'loadConsumption'),
    };
    const gridTargetConfig = readGridTargetConfig(config);
    const coreUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'src', 'index.js')
    ).href;

    node.on('input', async function (msg) {
      try {
        const core = await import(coreUrl);
        const timeSeries = core.createTimeSeries({
          start: msg.time,
          intervalMinutes,
          horizonHours,
        });

        const fixedPrices = {};
        applyGridTarget(core, timeSeries, msg, gridTargetConfig, node);

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

        for (const [timeSeriesField, forecastConfig] of Object.entries(forecastConfigs)) {
          if (forecastConfig.sourceType !== 'message') continue;

          const { entries, skipped } = core.extractTimeSeriesValues(msg, {
            path: forecastConfig.path,
            startField: forecastConfig.startField,
            endField: forecastConfig.endField,
            valueField: forecastConfig.valueField,
          });

          const result = core.applyTimeSeriesValues(
            timeSeries,
            entries,
            (timestep, value) => {
              if (timeSeriesField === 'productionPowerKw') {
                timestep.solar.productionPowerKw = value ?? 0;
              } else {
                timestep.load.consumptionPowerKw = value ?? 0;
              }
            }
          );

          if (skipped > 0) {
            node.warn(
              `Skipped ${skipped} invalid ${forecastConfig.label} entries`
            );
          }
          if (result.missing > 0) {
            node.warn(
              `No ${forecastConfig.label} found for ${result.missing} time-series interval(s)`
            );
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

function readForecastConfig(config, prefix) {
  const sourceType = config[`${prefix}SourceType`] ?? 'none';
  return {
    sourceType,
    path: config[`${prefix}Path`] ?? '',
    startField: config[`${prefix}StartField`] ?? 'start',
    endField: config[`${prefix}EndField`] ?? 'end',
    valueField: config[`${prefix}ValueField`] ?? 'value',
    label: forecastLabel(prefix),
  };
}

function forecastLabel(prefix) {
  return {
    solarProduction: 'expected PV production',
    loadConsumption: 'expected consumption',
  }[prefix] ?? 'forecast';
}

function parsePrice(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Grid prices must be finite numbers or empty');
  }
  return number;
}

function readGridTargetConfig(config) {
  const sourceType = config.gridTargetSourceType ?? 'none';
  return {
    sourceType,
    value: parsePower(config.gridTargetPowerKw),
    path: config.gridTargetPath ?? '',
    startField: config.gridTargetStartField ?? 'start',
    endField: config.gridTargetEndField ?? 'end',
    valueField: config.gridTargetValueField ?? 'value',
    dayStart: config.gridTargetDayStart ?? '06:00',
    dayEnd: config.gridTargetDayEnd ?? '20:00',
    dayValue: parsePower(config.gridTargetDayPowerKw),
    nightValue: parsePower(config.gridTargetNightPowerKw),
  };
}

function applyGridTarget(core, timeSeries, msg, config, node) {
  if (config.sourceType === 'fixed') {
    for (const timestep of timeSeries) {
      timestep.grid.targetPowerKw = config.value ?? 0;
    }
    return;
  }

  if (config.sourceType === 'message') {
    const { entries, skipped } = core.extractTimeSeriesValues(msg, {
      path: config.path,
      startField: config.startField,
      endField: config.endField,
      valueField: config.valueField,
    });

    const result = core.applyTimeSeriesValues(
      timeSeries,
      entries,
      (timestep, value) => {
        timestep.grid.targetPowerKw = value ?? 0;
      }
    );

    if (skipped > 0) {
      node.warn(`Skipped ${skipped} invalid grid target entries`);
    }
    if (result.missing > 0) {
      node.warn(
        `No grid target found for ${result.missing} time-series interval(s)`
      );
    }
    return;
  }

  if (config.sourceType === 'dayNight') {
    for (const timestep of timeSeries) {
      const hour = new Date(timestep.start).getHours();
      const minute = new Date(timestep.start).getMinutes();
      const timeMinutes = hour * 60 + minute;
      const dayStart = parseClockMinutes(config.dayStart);
      const dayEnd = parseClockMinutes(config.dayEnd);
      const isDay =
        dayStart <= dayEnd
          ? timeMinutes >= dayStart && timeMinutes < dayEnd
          : timeMinutes >= dayStart || timeMinutes < dayEnd;
      timestep.grid.targetPowerKw = isDay
        ? config.dayValue ?? 0
        : config.nightValue ?? 0;
    }
  }
}

function parsePower(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Grid target power must be a finite number or empty');
  }
  return number;
}

function parseClockMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value));
  if (!match) {
    throw new Error(`Invalid time of day: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
