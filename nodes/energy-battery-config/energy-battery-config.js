module.exports = function(RED) {
  // Efficiencies are configured exclusively via power dependent curves.
  // New nodes default to a 97% charge and discharge efficiency from 0 kW
  // upwards. Flows without a usable stored curve fall back to the same
  // default instead of becoming loss-free silently.
  const DEFAULT_EFFICIENCY_CURVE = [{ up_to_kw: 0, efficiency: 0.97 }]

  function parseEfficiencyCurve(value) {
    if (Array.isArray(value)) return value.length > 0 ? value : null
    if (typeof value !== 'string' || value.trim() === '') return null
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
    } catch (error) {
      return null
    }
  }

  function EnergyBatteryConfigNode(n) {
    RED.nodes.createNode(this,n);
    this.name = n.name
    this.capacity_kwh = Number(n.capacity_kwh ?? 15)
    this.max_charge_power_kw = Number(n.max_charge_power_kw ?? 10)
    this.max_discharge_power_kw = Number(n.max_discharge_power_kw ?? 10)
    this.idle_losses_kw = Number(n.idle_losses_kw ?? 0)
    this.charge_efficiency_curve =
      parseEfficiencyCurve(n.charge_efficiency_curve) ?? DEFAULT_EFFICIENCY_CURVE
    this.discharge_efficiency_curve =
      parseEfficiencyCurve(n.discharge_efficiency_curve) ?? DEFAULT_EFFICIENCY_CURVE
  }
  RED.nodes.registerType("energy-battery-config",EnergyBatteryConfigNode);
}
