module.exports = function (RED) {
  function EnergySystemConfigNode(config) {
    RED.nodes.createNode(this, config)
    this.name = config.name
    this.battery_ref = config.battery_ref || null
    this.grid_ref = config.grid_ref || null
    this.analysis_interval_minutes = Number(config.analysis_interval_minutes ?? 15)
  }
  RED.nodes.registerType('energy-system-config', EnergySystemConfigNode)
}