// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path')
const { pathToFileURL } = require('url')

module.exports = function (RED) {
  function EnergyAdvisorNode(config) {
    RED.nodes.createNode(this, config)
    const node = this

    const coreUrl = pathToFileURL(path.join(__dirname, '..', '..', 'src', 'index.js')).href

    node.on('input', async function (msg) {
      try {
        const core = await import(coreUrl)
        const PrematureExportStrategy = core.PrematureExportStrategy

        const simulationIntervals = msg.simulationIntervals || msg.payload
        if (!Array.isArray(simulationIntervals)) {
          node.error(
            'Invalid input: msg.simulationIntervals or msg.payload must be an array of simulation intervals'
          )
          return
        }

        const strategy = new PrematureExportStrategy({
          maxExportPowerKw:
            config.maxExportPowerKw === '' || config.maxExportPowerKw === undefined
              ? 7.46
              : Number(config.maxExportPowerKw),
          intervalMinutes:
            config.intervalMinutes === '' || config.intervalMinutes === undefined
              ? 15
              : Number(config.intervalMinutes),
        })

        const result = strategy.run(simulationIntervals)

        msg.simulationIntervals = result.simulationIntervals
        msg.payload = result.simulationIntervals
        msg.remainingEnergyToExport = result.remainingEnergyToExport
        msg.totalPlannedPrematureExports = result.totalPlannedPrematureExports

        node.send(msg)
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err))
      }
    })
  }
  RED.nodes.registerType('energy-advisor', EnergyAdvisorNode)
}
