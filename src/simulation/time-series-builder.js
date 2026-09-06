import { roundToNearestHours, roundToNearestMinutes } from 'date-fns';
/**
 * Create an empty, simulation-ready TimeSeries for a future horizon.
 *
 * The start is aligned down to the configured interval. All forecast values
 * start at zero so downstream nodes can enrich the series with forecasts,
 * prices and targets before simulation.
 *
 * @param {Object} options
 * @param {Date|string|number} options.start Start time of the series.
 * @param {15|60} options.intervalMinutes Timestep duration in minutes.
 * @param {number} options.horizonHours Number of hours to create.
 * @returns {Array<Object>}
 */
export function createTimeSeries({
  start = new Date(),
  intervalMinutes = 15,
  horizonHours = 24,
} = {}) {
  const interval = Number(intervalMinutes);
  const horizon = Number(horizonHours);

  if (![15, 60].includes(interval)) {
    throw new Error('intervalMinutes must be 15 or 60');
  }
  if (!Number.isFinite(horizon) || horizon <= 0) {
    throw new Error('horizonHours must be a positive number');
  }
  if (!Number.isInteger(horizon)) {
    throw new Error('horizonHours must be a whole number');
  }

  const startDate = new Date(start);
  if (!Number.isFinite(startDate.getTime())) {
    throw new Error('start must be a valid date');
  }

  const intervalMs = interval * 60 * 1000;
  const alignedStart =
    interval == 15
      ? roundToNearestMinutes(startDate, {
          nearestTo: 15,
          roundingMethod: 'floor',
        })
      : roundToNearestHours(startDate, {
          nearestTo: 1,
          roundingMethod: 'floor',
        });

  const stepCount = (horizon * 60) / interval;
  const timeSeries = [];

  for (let index = 0; index < stepCount; index += 1) {
    const stepStart = new Date(alignedStart.getTime() + index * intervalMs);
    const stepEnd = new Date(stepStart.getTime() + intervalMs);

    timeSeries.push({
      start: stepStart.toISOString(),
      end: stepEnd.toISOString(),
      solar: {
        productionPowerKw: 0,
      },
      load: {
        consumptionPowerKw: 0,
        extraLoads: [],
      },
      grid: {
        targetPowerKw: 0,
        buyPerKwh: null,
        sellPerKwh: null,
        spotPerKwh: null,
      },
    });
  }

  return timeSeries;
}

/**
 * Set fixed grid prices on every timestep in a TimeSeries.
 *
 * A null or undefined price leaves that price field unset (null). This keeps
 * the helper neutral for contracts that do not provide one of the prices.
 *
 * @param {Array<Object>} timeSeries TimeSeries to modify.
 * @param {Object} prices Fixed grid prices in currency per kWh.
 * @param {number|null} [prices.buyPerKwh] Grid import price.
 * @param {number|null} [prices.sellPerKwh] Grid export remuneration.
 * @param {number|null} [prices.spotPerKwh] Spot market price.
 * @returns {Array<Object>} The same TimeSeries instance.
 */
export function setGridPrices(
  timeSeries,
  { buyPerKwh = null, sellPerKwh = null, spotPerKwh = null } = {}
) {
  if (!Array.isArray(timeSeries)) {
    throw new Error('timeSeries must be an array');
  }

  const prices = { buyPerKwh, sellPerKwh, spotPerKwh };
  for (const [name, value] of Object.entries(prices)) {
    if (value !== null && value !== undefined && !Number.isFinite(Number(value))) {
      throw new Error(`${name} must be a finite number or null`);
    }
  }

  for (const timestep of timeSeries) {
    timestep.grid ??= {};
    timestep.grid.buyPerKwh = buyPerKwh == null ? null : Number(buyPerKwh);
    timestep.grid.sellPerKwh = sellPerKwh == null ? null : Number(sellPerKwh);
    timestep.grid.spotPerKwh = spotPerKwh == null ? null : Number(spotPerKwh);
  }

  return timeSeries;
}
