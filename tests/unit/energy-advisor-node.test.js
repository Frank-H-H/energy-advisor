import { describe, expect, it } from 'vitest';
import energyAdvisorNode from '../../nodes/energy-advisor/energy-advisor.js';

describe('energy-advisor Node-RED adapter', () => {
  it('runs the configured active strategies and forwards the Plan', async () => {
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
      },
    };

    energyAdvisorNode(RED);
    const node = {};
    RED.constructor.call(node, {
      strategies: 'premature-export',
      priority: '80',
    });

    await inputHandlers[0]({
      payload: [
        {
          start: '2026-01-01T00:00:00Z',
          end: '2026-01-01T00:15:00Z',
          values: {
            importPricePerKwh: 0.2,
            grid_export_kwh: 0,
            gridTargetPowerKw: 0,
          },
        },
        {
          start: '2026-01-01T00:15:00Z',
          end: '2026-01-01T00:30:00Z',
          values: {
            importPricePerKwh: -0.1,
            grid_export_kwh: 2,
            gridTargetPowerKw: -1,
          },
        },
      ],
    });

    expect(errors).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.actions).toHaveLength(1);
    expect(sent[0].payload.actions[0].type).toBe('set-grid-target');
    expect(sent[0].payload.actions[0].gridTargetPowerKw).toBeCloseTo(-7, 10);
  });
});
