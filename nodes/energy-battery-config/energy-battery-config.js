module.exports = function(RED) {
  function parseEfficiencyCurve(value) {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string' || value.trim() === '') return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  function EnergyBatteryConfigNode(n) {
    RED.nodes.createNode(this,n);
    this.name = n.name
    this.capacity_kwh = Number(n.capacity_kwh ?? 15)
    this.max_charge_power_kw = Number(n.max_charge_power_kw ?? 10)
    this.max_discharge_power_kw = Number(n.max_discharge_power_kw ?? 10)
    this.charge_efficiency = Number(n.charge_efficiency ?? 1)
    this.discharge_efficiency = Number(n.discharge_efficiency ?? 1)
    this.charge_efficiency_curve = parseEfficiencyCurve(n.charge_efficiency_curve)
    this.discharge_efficiency_curve = parseEfficiencyCurve(n.discharge_efficiency_curve)
  }
  RED.nodes.registerType("energy-battery-config",EnergyBatteryConfigNode);
}
