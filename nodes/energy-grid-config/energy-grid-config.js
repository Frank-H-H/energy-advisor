module.exports = function(RED) {
  function EnergyGridConfigNode(n) {
    RED.nodes.createNode(this,n);
    this.name = n.name
    this.max_export_power_kw = Number(n.max_export_power_kw ?? 7)
  }
  RED.nodes.registerType("energy-grid-config",EnergyGridConfigNode);
}
