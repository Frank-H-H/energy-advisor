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
        const AdvisorEngine = core.AdvisorEngine
        const forecast = msg.payload
        if (!Array.isArray(forecast)) {
          node.error('Invalid input: msg.payload must be a forecast array (from energy-forecast)')
          return
        }
        // optional components can be passed in msg.components
        const recs = AdvisorEngine.run({ forecast, components: msg.components })
        node.send({ payload: recs })
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err))
      }
    })
  }
  RED.nodes.registerType('energy-advisor', EnergyAdvisorNode)
}