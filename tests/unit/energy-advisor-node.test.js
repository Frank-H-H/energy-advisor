import { describe, expect, it } from 'vitest';
import energyAdvisorNode from '../../nodes/energy-advisor/energy-advisor.js';

function createRed(batteryConfigs = {}) {
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
        expect(name).toBe('energy-advisor');
        RED.constructor = constructor;
      },
      getNode: (id) => batteryConfigs[id] ?? null,
    },
  };

  return { sent, errors, inputHandlers, RED };
}

describe('energy-advisor Node-RED adapter', () => {
  it('runs the configured active strategies and forwards the Plan', async () => {
    const { sent, errors, inputHandlers, RED } = createRed();

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'immediate-negative-price-export',
      priority: '80',
    });

    const forecast = {
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          grid: {
            spotPerKwh: 0.2,
            exportKwh: 0,
            targetPowerKw: 0,
          },
        },
        {
          start: '2026-01-01T00:15:00Z',
          end: '2026-01-01T00:30:00Z',
          grid: {
            spotPerKwh: -0.1,
            exportKwh: 2,
            targetPowerKw: -1,
          },
        },
      ],
    };
    const initialState = { batteryEnergyKwh: 4 };
    const msg = { payload: forecast, initialState };

    await inputHandlers[0](msg);

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toBe(forecast);
    expect(sent[0].initialState).toBe(initialState);
    expect(sent[0].plan).toBeDefined();
    expect(sent[0].plan.actions).toHaveLength(1);
    expect(sent[0].plan.actions[0].type).toBe('set-grid-target');
    expect(sent[0].plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
  });

  it('uses TimeSeries duration instead of a configured strategy interval', async () => {
    const { sent, errors, inputHandlers, RED } = createRed();

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'immediate-negative-price-export',
      maxExportPowerKw: '4',
      intervalMinutes: '15',
    });

    const forecast = {
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T01:00:00Z',
          grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
        },
        {
          start: '2026-01-01T01:00:00Z',
          end: '2026-01-01T02:00:00Z',
          grid: { spotPerKwh: -0.1, exportKwh: 3, targetPowerKw: 0 },
        },
      ],
    };

    await inputHandlers[0]({ payload: forecast });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].plan.actions[0].gridTargetPowerKw).toBeCloseTo(-3, 10);
  });

  it('supports the distributed negative-price export strategy', async () => {
    const { sent, errors, inputHandlers, RED } = createRed();

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'distributed-negative-price-export',
    });

    const forecast = {
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
        },
        {
          start: '2026-01-01T00:15:00Z',
          end: '2026-01-01T00:30:00Z',
          grid: { spotPerKwh: 0.3, exportKwh: 0, targetPowerKw: 0 },
        },
        {
          start: '2026-01-01T00:30:00Z',
          end: '2026-01-01T00:45:00Z',
          grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: 0 },
        },
      ],
    };

    await inputHandlers[0]({ payload: forecast });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].plan.actions).toHaveLength(2);
    expect(
      sent[0].plan.actions.map((action) => action.gridTargetPowerKw)
    ).toEqual([-4, -4]);
  });

  it('applies the configured strategies in order within each timestep', async () => {
    const { sent, errors, inputHandlers, RED } = createRed();

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies:
        'immediate-negative-price-export,distributed-negative-price-export',
    });

    const forecast = {
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          grid: { spotPerKwh: 0.2, exportKwh: 0, targetPowerKw: 0 },
        },
        {
          start: '2026-01-01T00:15:00Z',
          end: '2026-01-01T00:30:00Z',
          grid: { spotPerKwh: -0.1, exportKwh: 2, targetPowerKw: -1 },
        },
      ],
    };

    await inputHandlers[0]({ payload: forecast });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    // Both strategies plan the same timestep. The immediate strategy
    // sets -7 kW; the distributed strategy builds on that target and is
    // capped at the maximum export power.
    expect(sent[0].plan.actions).toHaveLength(2);
    expect(sent[0].plan.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
    expect(sent[0].plan.actions[1].gridTargetPowerKw).toBeCloseTo(-7.46, 10);
  });

  it('supports the battery minimum SOC strategy with a referenced battery config', async () => {
    const batteryConfigs = {
      bat1: {
        capacity_kwh: 10,
        max_charge_power_kw: 4,
        charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 1 }],
      },
    };
    const { sent, errors, inputHandlers, RED } = createRed(batteryConfigs);

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'battery-min-soc-hold',
      batteryConfig: 'bat1',
    });

    const forecast = {
      timeSeries: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          battery: { energyKwh: 2.0 },
          grid: { buyPerKwh: 0.05, targetPowerKw: 0 },
        },
        {
          start: '2026-01-01T00:15:00Z',
          end: '2026-01-01T00:30:00Z',
          battery: { energyKwh: 0.5 },
          grid: { buyPerKwh: 0.3, targetPowerKw: 0 },
        },
      ],
    };

    await inputHandlers[0]({ payload: forecast });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].plan.actions).toHaveLength(1);
    expect(sent[0].plan.actions[0].type).toBe('set-grid-target');
    expect(sent[0].plan.actions[0].gridTargetPowerKw).toBeCloseTo(4, 10);
    expect(sent[0].plan.actions[0].reason).toBe('HOLD_BATTERY_MIN_SOC');
  });

  it('errors when the battery minimum SOC strategy has no battery config reference', async () => {
    const { sent, errors, inputHandlers, RED } = createRed();

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'battery-min-soc-hold',
      batteryConfig: '',
    });

    await inputHandlers[0]({ payload: { timeSeries: [] } });

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain(
      'battery-min-soc-hold requires a battery config'
    );
    expect(sent).toHaveLength(0);
  });
});
