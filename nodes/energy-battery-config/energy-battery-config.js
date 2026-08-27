module.exports = function (RED) {
  function EnergyBatteryConfigNode(config) {
    RED.nodes.createNode(this, config)
    this.name = config.name
    this.capacity_kwh = Number(config.capacity_kwh ?? 43)
    this.max_charge_power_kw = Number(config.max_charge_power_kw ?? 8)
    this.max_discharge_power_kw = Number(config.max_discharge_power_kw ?? 8)
    this.charge_efficiency = Number(config.charge_efficiency ?? 0.9)
    this.notes = config.notes ?? ''
  }
  RED.nodes.registerType('energy-battery-config', EnergyBatteryConfigNode, {
    credentials: {}
  })
}