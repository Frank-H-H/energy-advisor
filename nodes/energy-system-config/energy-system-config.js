module.exports = function (RED) {
  function EnergySystemConfigNode(config) {
    RED.nodes.createNode(this, config)
    this.name = config.name
    this.battery_config = config.battery_config || null
    this.grid_config = config.grid_config || null
    this.analysis_interval_minutes = Number(config.analysis_interval_minutes ?? 15)
  }
  RED.nodes.registerType('energy-system-config', EnergySystemConfigNode)
}