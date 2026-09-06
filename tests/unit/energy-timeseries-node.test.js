import { describe, expect, it, vi } from 'vitest';
import energyTimeSeriesNode from '../../nodes/energy-timeseries/energy-timeseries.js';

describe('energy-timeseries Node-RED adapter', () => {
  function createRED() {
    const sent = [];
    const errors = [];
    const warnings = [];
    const inputHandlers = [];
    const RED = {
      nodes: {
        createNode(node) {
          node.on = (event, handler) => {
            if (event === 'input') inputHandlers.push(handler);
          };
          node.send = (msg) => sent.push(msg);
          node.error = (error) => errors.push(error);
          node.warn = (warning) => warnings.push(warning);
        },
        registerType(name, constructor) {
          expect(name).toBe('energy-timeseries');
          RED.constructor = constructor;
        },
      },
    };
    return { RED, sent, errors, warnings, inputHandlers };
  }

  it('creates 15-minute timesteps for the configured horizon', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:07:30Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call({}, { intervalMinutes: '15', horizonHours: '2' });

    const originalPayload = { marker: true };
    await inputHandlers[0]({ payload: originalPayload, other: 'value' });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].other).toBe('value');
    expect(sent[0].payload.timeSeries).toHaveLength(8);
    expect(sent[0].payload.timeSeries[0]).toMatchObject({
      start: '2026-01-01T12:00:00.000Z',
      end: '2026-01-01T12:15:00.000Z',
      solar: { productionPowerKw: 0 },
      load: { consumptionPowerKw: 0, extraLoads: [] },
      grid: {
        targetPowerKw: 0,
        buyPerKwh: null,
        sellPerKwh: null,
        spotPerKwh: null,
      },
    });

    vi.useRealTimers();
  });


  it('uses msg.time as the simulation start time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call({}, { intervalMinutes: '15', horizonHours: '1' });

    await inputHandlers[0]({
      time: '2026-01-01T12:37:00Z',
      payload: {},
    });

    expect(errors).toHaveLength(0);
    expect(sent[0].payload.timeSeries[0].start).toBe(
      '2026-01-01T12:30:00.000Z'
    );
    expect(sent[0].payload.timeSeries[3].end).toBe(
      '2026-01-01T13:30:00.000Z'
    );

    vi.useRealTimers();
  });

  it('applies a fixed grid target to every timestep', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '2',
        gridTargetSourceType: 'fixed',
        gridTargetPowerKw: '1.234',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T12:00:00Z',
      payload: {},
    });

    expect(errors).toHaveLength(0);
    expect(
      sent[0].payload.timeSeries.every(
        (timestep) => timestep.grid.targetPowerKw === 1.234
      )
    ).toBe(true);

    vi.useRealTimers();
  });

  it('maps grid target from a configurable message attribute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { RED, sent, errors, warnings, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '2',
        gridTargetSourceType: 'message',
        gridTargetPath: 'payload.gridTargets',
        gridTargetStartField: 'from',
        gridTargetEndField: 'to',
        gridTargetValueField: 'target',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T12:00:00Z',
      payload: {
        gridTargets: [
          { from: '2026-01-01T12:00:00Z', to: '2026-01-01T13:00:00Z', target: 1.5 },
          { from: '2026-01-01T13:00:00Z', to: '2026-01-01T14:00:00Z', target: 2.5 },
        ],
      },
    });

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(sent[0].payload.timeSeries.map((timestep) => timestep.grid.targetPowerKw)).toEqual([
      1.5, 2.5,
    ]);

    vi.useRealTimers();
  });

  it('applies separate day and night grid targets', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '3',
        gridTargetSourceType: 'dayNight',
        gridTargetDayStart: '06:00',
        gridTargetDayEnd: '20:00',
        gridTargetDayPowerKw: '2',
        gridTargetNightPowerKw: '0',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T18:00:00Z',
      payload: {},
    });

    expect(errors).toHaveLength(0);
    expect(sent[0].payload.timeSeries.map((timestep) => timestep.grid.targetPowerKw)).toEqual([
      2, 0, 0,
    ]);

    vi.useRealTimers();
  });

  it('applies configured fixed buy and sell prices to every timestep', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:07:30Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '2',
        buyPriceSourceType: 'fixed',
        buyPerKwh: '0.32',
        sellPriceSourceType: 'fixed',
        sellPerKwh: '0.08',
        spotPriceSourceType: 'none',
      }
    );

    await inputHandlers[0]({ payload: {} });

    expect(errors).toHaveLength(0);
    expect(sent[0].payload.timeSeries).toHaveLength(2);
    expect(
      sent[0].payload.timeSeries.every(
        (timestep) =>
          timestep.grid.buyPerKwh === 0.32 &&
          timestep.grid.sellPerKwh === 0.08 &&
          timestep.grid.spotPerKwh === null
      )
    ).toBe(true);

    vi.useRealTimers();
  });

  it('maps buy and sell prices independently from message attributes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T14:07:30Z'));

    const { RED, sent, errors, warnings, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '1',
        buyPriceSourceType: 'message',
        buyPricePath: 'payload.buyPrices',
        buyPriceStartField: 'from',
        buyPriceEndField: 'to',
        buyPriceValueField: 'price',
        sellPriceSourceType: 'message',
        sellPricePath: 'payload.sellPrices',
        sellPriceStartField: 'from',
        sellPriceEndField: 'to',
        sellPriceValueField: 'price',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T14:00:00Z',
      payload: {
        buyPrices: [
          { from: '2026-01-01T14:00:00Z', to: '2026-01-01T15:00:00Z', price: 0.32 },
        ],
        sellPrices: [
          { from: '2026-01-01T14:00:00Z', to: '2026-01-01T15:00:00Z', price: 0.08 },
        ],
      },
    });

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(sent[0].payload.timeSeries[0].grid.buyPerKwh).toBe(0.32);
    expect(sent[0].payload.timeSeries[0].grid.sellPerKwh).toBe(0.08);

    vi.useRealTimers();
  });

  it('maps spot prices from a configurable message attribute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T14:07:30Z'));

    const { RED, sent, errors, warnings, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '1',
        spotPriceSourceType: 'message',
        spotPricePath: 'payload.attributes.data',
        spotPriceStartField: 'start_time',
        spotPriceEndField: 'end_time',
        spotPriceValueField: 'price_per_kwh',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T14:00:00Z',
      payload: {
        attributes: {
          data: [
            {
              start_time: '2026-01-01T14:00:00Z',
              end_time: '2026-01-01T14:15:00Z',
              price_per_kwh: 0.1,
            },
            {
              start_time: '2026-01-01T14:15:00Z',
              end_time: '2026-01-01T14:30:00Z',
              price_per_kwh: 0.2,
            },
            {
              start_time: '2026-01-01T14:30:00Z',
              end_time: '2026-01-01T14:45:00Z',
              price_per_kwh: 0.3,
            },
            {
              start_time: '2026-01-01T14:45:00Z',
              end_time: '2026-01-01T15:00:00Z',
              price_per_kwh: 0.4,
            },
          ],
        },
      },
    });

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(sent[0].payload.timeSeries[0].grid.spotPerKwh).toBeCloseTo(0.25);

    vi.useRealTimers();
  });

  it('maps expected PV production from a configurable message attribute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T14:07:30Z'));

    const { RED, sent, errors, warnings, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '2',
        solarProductionSourceType: 'message',
        solarProductionPath: 'payload.pvForecast',
        solarProductionStartField: 'from',
        solarProductionEndField: 'to',
        solarProductionValueField: 'power',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T14:00:00Z',
      payload: {
        pvForecast: [
          { from: '2026-01-01T14:00:00Z', to: '2026-01-01T15:00:00Z', power: 2.4 },
          { from: '2026-01-01T15:00:00Z', to: '2026-01-01T16:00:00Z', power: 3.1 },
        ],
      },
    });

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(sent[0].payload.timeSeries.map((timestep) => timestep.solar.productionPowerKw)).toEqual([2.4, 3.1]);

    vi.useRealTimers();
  });

  it('maps expected consumption independently from a configurable message attribute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T14:07:30Z'));

    const { RED, sent, errors, warnings, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call(
      {},
      {
        intervalMinutes: '60',
        horizonHours: '1',
        loadConsumptionSourceType: 'message',
        loadConsumptionPath: 'payload.loadForecast',
        loadConsumptionStartField: 'from',
        loadConsumptionEndField: 'to',
        loadConsumptionValueField: 'power',
      }
    );

    await inputHandlers[0]({
      time: '2026-01-01T14:00:00Z',
      payload: {
        loadForecast: [
          { from: '2026-01-01T14:00:00Z', to: '2026-01-01T15:00:00Z', power: 0.8 },
        ],
      },
    });

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(sent[0].payload.timeSeries[0].load.consumptionPowerKw).toBe(0.8);

    vi.useRealTimers();
  });

  it('creates 60-minute timesteps and replaces an existing timeSeries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:07:30Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call({}, { intervalMinutes: '60', horizonHours: '3' });

    await inputHandlers[0]({
      time: '2026-01-01T14:00:00Z',
      payload: { timeSeries: [{ start: 'old' }], keep: true },
    });

    expect(errors).toHaveLength(0);
    expect(sent[0].payload.keep).toBe(true);
    expect(sent[0].payload.timeSeries).toHaveLength(3);
    expect(sent[0].payload.timeSeries[0].start).toBe(
      '2026-01-01T14:00:00.000Z'
    );
    expect(sent[0].payload.timeSeries[2].end).toBe('2026-01-01T17:00:00.000Z');

    vi.useRealTimers();
  });
});
