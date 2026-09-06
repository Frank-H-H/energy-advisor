import { describe, expect, it, vi } from 'vitest';
import energyTimeSeriesNode from '../../nodes/energy-timeseries/energy-timeseries.js';

describe('energy-timeseries Node-RED adapter', () => {
  function createRED() {
    const sent = [];
    const errors = [];
    const inputHandlers = [];
    const RED = {
      nodes: {
        createNode(node) {
          node.on = (event, handler) => {
            if (event === 'input') inputHandlers.push(handler);
          };
          node.send = (msg) => sent.push(msg);
          node.error = (error) => errors.push(error);
        },
        registerType(name, constructor) {
          expect(name).toBe('energy-timeseries');
          RED.constructor = constructor;
        },
      },
    };
    return { RED, sent, errors, inputHandlers };
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

  it('creates 60-minute timesteps and replaces an existing timeSeries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:07:30Z'));

    const { RED, sent, errors, inputHandlers } = createRED();
    energyTimeSeriesNode(RED);
    RED.constructor.call({}, { intervalMinutes: '60', horizonHours: '3' });

    await inputHandlers[0]({
      payload: { timeSeries: [{ start: 'old' }], keep: true },
    });

    expect(errors).toHaveLength(0);
    expect(sent[0].payload.keep).toBe(true);
    expect(sent[0].payload.timeSeries).toHaveLength(3);
    expect(sent[0].payload.timeSeries[0].start).toBe('2026-01-01T12:00:00.000Z');
    expect(sent[0].payload.timeSeries[2].end).toBe('2026-01-01T15:00:00.000Z');

    vi.useRealTimers();
  });
});
