/**
 * Basic Battery model.
 * capacity_kwh: kWh
 * soc_kwh: kWh (initial)
 * min_soc_kwh: kWh
 * max_charge_power_kw: kW
 * max_discharge_power_kw: kW
 * charge_efficiency: 0..1
 * discharge_efficiency: 0..1
 */

export class Battery {
  constructor(cfg = {}) {
    this.capacity = Number(cfg.capacity_kwh || 0)
    this.soc = Number(cfg.soc_kwh ?? 0)
    this.minSoc = Number(cfg.min_soc_kwh ?? 0)
    this.maxChargePower = Number(cfg.max_charge_power_kw ?? Infinity)
    this.maxDischargePower = Number(cfg.max_discharge_power_kw ?? Infinity)
    this.chargeEff = Number(cfg.charge_efficiency ?? 1)
    this.dischargeEff = Number(cfg.discharge_efficiency ?? 1)
    // clamp
    if (this.soc > this.capacity) this.soc = this.capacity
    if (this.soc < this.minSoc) this.soc = this.minSoc
  }

  availableCapacityKWh() {
    return Math.max(0, this.capacity - this.soc)
  }

  availableDischargeKWh() {
    return Math.max(0, this.soc - this.minSoc)
  }

  // Attempt to charge by energy_kwh (before efficiencies). Returns actual charged kWh (into battery) and gridEnergyUsed (accounting for efficiency)
  charge(energy_kwh) {
    const chargeable = Math.min(energy_kwh * this.chargeEff, this.availableCapacityKWh())
    // energy taken from grid/PV before efficiency
    const energyFromSource = chargeable / this.chargeEff
    this.soc += chargeable
    if (this.soc > this.capacity) this.soc = this.capacity
    return { chargedKWh: chargeable, sourceKWh: energyFromSource }
  }

  // Attempt to discharge requestedEnergy_kwh (battery output before efficiency). Returns {dischargedKWh, deliveredKWh}
  discharge(requestedEnergy_kwh) {
    const availableOut = this.availableDischargeKWh()
    const discharged = Math.min(requestedEnergy_kwh, availableOut)
    // energy delivered to load/grid after discharge efficiency
    const delivered = discharged * this.dischargeEff
    this.soc -= discharged
    if (this.soc < this.minSoc) this.soc = this.minSoc
    return { dischargedKWh: discharged, deliveredKWh: delivered }
  }
}
