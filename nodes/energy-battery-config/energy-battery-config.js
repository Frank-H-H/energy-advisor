module.exports = function(RED) {
  function EnergyBatteryConfigNode(n) {
    RED.nodes.createNode(this,n);
    this.name = n.name
    this.capacity_kwh = Number(n.capacity_kwh ?? 15)
    this.max_charge_power_kw = Number(n.max_charge_power_kw ?? 10)
    this.max_discharge_power_kw = Number(n.max_discharge_power_kw ?? 10)
    this.charge_efficiency = Number(n.charge_efficiency ?? 10)
  }
  RED.nodes.registerType("energy-battery-config",EnergyBatteryConfigNode);
}