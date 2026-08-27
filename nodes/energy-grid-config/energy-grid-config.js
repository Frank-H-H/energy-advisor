module.exports = function (RED) {
  function EnergyGridConfigNode(config) {
    RED.nodes.createNode(this, config)
    this.name = config.name
    this.max_export_power_kw = Number(config.max_export_power_kw ?? 7)
  }
  RED.nodes.registerType('energy-grid-config', EnergyGridConfigNode)
}