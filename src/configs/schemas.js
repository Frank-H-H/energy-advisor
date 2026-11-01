// mapping helper + simple schema defaults for the config nodes

import { normalizeEfficiencyCurve } from '../components/battery.js'

// Efficiencies are configured exclusively via power dependent curves.
// New battery configs default to a 97% charge and discharge efficiency
// from 0 kW upwards; the fixed scalar efficiencies are gone.
export const DEFAULT_EFFICIENCY_CURVE = [{ up_to_kw: 0, efficiency: 0.97 }]

export const batteryConfigSchema = {
  type: 'energy-battery-config',
  defaults: {
    name: '',
    capacity_kwh: 43,
    max_charge_power_kw: 8,
    max_discharge_power_kw: 8,
    // Constant standby/idle power of the whole system (kW)
    idle_losses_kw: 0,
    // Power dependent efficiency curves: [{ up_to_kw, efficiency }]
    // A single point at up_to_kw 0 acts as a constant efficiency.
    charge_efficiency_curve: DEFAULT_EFFICIENCY_CURVE,
    discharge_efficiency_curve: DEFAULT_EFFICIENCY_CURVE,
    notes: ''
  }
}

export const gridConfigSchema = {
  type: 'energy-grid-config',
  defaults: {
    name: '',
    max_export_power_kw: 7
  }
}

export function mapConfigsToComponents(batteryConfig = null, gridConfig = null) {
  const b = batteryConfig || {}
  const g = gridConfig || {}

  const components = {
    battery: {
      idle_losses_kw: Number(b.idle_losses_kw ?? b.idleLossesKw ?? 0),
      capacity_kwh: Number(b.capacity_kwh ?? b.capacity ?? 0),
      soc_kwh: Number(b.soc_kwh ?? b.initial_soc_kwh ?? 0),
      min_soc_kwh: Number(b.min_soc_kwh ?? 0),
      max_charge_power_kw: Number(b.max_charge_power_kw ?? b.maxChargeKw ?? 0),
      max_discharge_power_kw: Number(b.max_discharge_power_kw ?? b.maxDischargeKw ?? 0),
      charge_efficiency_curve:
        normalizeEfficiencyCurve(b.charge_efficiency_curve) ??
        DEFAULT_EFFICIENCY_CURVE,
      discharge_efficiency_curve:
        normalizeEfficiencyCurve(b.discharge_efficiency_curve) ??
        DEFAULT_EFFICIENCY_CURVE
    },
    grid: {
      max_export_power_kw: Number(g.max_export_power_kw ?? g.maxExportKw ?? 0)
    }
  }

  return components
}
