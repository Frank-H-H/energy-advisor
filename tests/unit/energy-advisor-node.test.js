import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import energyAdvisorNode from '../../nodes/energy-advisor/energy-advisor.js'

describe('energy-advisor Node-RED adapter', () => {
  it('runs the premature export strategy and forwards the message', async () => {
    const sent = []
    const errors = []
    const inputHandlers = []

    const RED = {
      nodes: {
        createNode(node) {
          node.on = (event, handler) => {
            if (event === 'input') inputHandlers.push(handler)
          }
          node.send = (msg) => sent.push(msg)
          node.error = (error) => errors.push(error)
        },
        registerType(name, constructor) {
          expect(name).toBe('energy-advisor')
          RED.constructor = constructor
        },
      },
    }

    energyAdvisorNode(RED)

    const node = {}
    RED.constructor.call(node, {
      maxExportPowerKw: '',
      intervalMinutes: '',
    })

    await inputHandlers[0]({
      simulationIntervals: [
        { importPrice: 0.2, exportedEnergy: 0, gridTarget: 0 },
        { importPrice: -0.1, exportedEnergy: 2, gridTarget: -1 },
      ],
    })

    expect(errors).toHaveLength(0)
    expect(sent).toHaveLength(1)
    expect(sent[0].totalPlannedPrematureExports).toBeCloseTo(1.75, 10)
    expect(sent[0].simulationIntervals[0].prematureExportPower).toBe(1.75)
  })
})
