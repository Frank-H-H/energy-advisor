module.exports = function(RED) {
  function EnergySystemConfigNode(n) {
    RED.nodes.createNode(this,n);
    this.name = n.name
    this.analysis_interval_minutes = Number(n.analysis_interval_minutes ?? 15)
  }
  RED.nodes.registerType("energy-system-config",EnergySystemConfigNode);
}
