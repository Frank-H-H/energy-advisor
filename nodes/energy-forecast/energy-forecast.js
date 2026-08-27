module.exports = function (RED) {
  function EnergyForecastNode(config) {
    RED.nodes.createNode(this, config)
    const node = this
    node.on("input", async function (msg) {
      try {
        const { ForecastEngine } = require("../../src/index.js")
        const input = msg.payload
        if (!input || !input.intervals) {
          node.error("Invalid input: msg.payload.intervals required")
          return
        }
        const forecast = ForecastEngine.run(input)
        node.send({ payload: forecast })
      } catch (err) {
        node.error(err)
      }
    })
  }
  RED.nodes.registerType("energy-forecast", EnergyForecastNode)
}
