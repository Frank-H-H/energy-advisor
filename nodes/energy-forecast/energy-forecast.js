// CommonJS Node-RED node file that dynamically imports the ESM core
const path = require('path')
const { pathToFileURL } = require('url')

module.exports = function (RED) {
  function EnergyForecastNode(config) {
    RED.nodes.createNode(this, config)
    const node = this

    // resolve file:// URL for the ESM module
    const coreUrl = pathToFileURL(path.join(__dirname, '..', '..', 'src', 'index.js')).href

    node.on('input', async function (msg) {
      try {
        if (!msg || !msg.payload) {
          node.error('msg.payload required')
          return
        }
        const core = await import(coreUrl)
        const ForecastEngine = core.ForecastEngine
        const input = msg.payload
        if (!input || !Array.isArray(input.intervals)) {
          node.error('Invalid input: msg.payload.intervals required (array)')
          return
        }
        const forecast = ForecastEngine.run(input)
        node.send({ payload: forecast })
      } catch (err) {
        node.error(err && err.stack ? err.stack : String(err))
      }
    })
  }
  RED.nodes.registerType('energy-forecast', EnergyForecastNode)
}