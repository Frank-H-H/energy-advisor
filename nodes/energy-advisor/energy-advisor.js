module.exports = function (RED) {
  function EnergyAdvisorNode(config) {
    RED.nodes.createNode(this, config)
    const node = this
    node.on("input", async function (msg) {
      try {
        const { AdvisorEngine } = require("../../src/index.js")
        const forecast = msg.payload
        if (!Array.isArray(forecast)) {
          node.error("Invalid input: msg.payload must be a forecast array (from energy-forecast)")
          return
        }
        const recs = AdvisorEngine.run({ forecast, components: msg.components })
        node.send({ payload: recs })
      } catch (err) {
        node.error(err)
      }
    })
  }
  RED.nodes.registerType("energy-advisor", EnergyAdvisorNode)
}
