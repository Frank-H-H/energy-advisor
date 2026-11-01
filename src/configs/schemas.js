// mapping helper + simple schema defaults for the config nodes

import { normalizeEfficiencyCurve } from '../components/battery.js'

export const batteryConfigSchema = {
  type: 'energy-battery-config',
  defaults: {
    name: '',
    capacity_kwh: 43,
    max_charge_power_kw: 8,
    max_discharge_power_kw: 8,
    charge_efficiency: 0.9,
    discharge_efficiency: 0.9,
    // Power dependent efficiency curves: [{ up_to_kw, efficiency }]
    // Empty curve = use the scalar efficiency fallback.
    charge_efficiency_curve: [],
    discharge_efficiency_curve: [],
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
      capacity_kwh: Number(b.capacity_kwh ?? b.capacity ?? 0),
      soc_kwh: Number(b.soc_kwh ?? b.initial_soc_kwh ?? 0),
      min_soc_kwh: Number(b.min_soc_kwh ?? 0),
      max_charge_power_kw: Number(b.max_charge_power_kw ?? b.maxChargeKw ?? 0),
      max_discharge_power_kw: Number(b.max_discharge_power_kw ?? b.maxDischargeKw ?? 0),
      charge_efficiency: Number(b.charge_efficiency ?? 0.9),
      discharge_efficiency: Number(b.discharge_efficiency ?? 1),
      charge_efficiency_curve:
        normalizeEfficiencyCurve(b.charge_efficiency_curve) ?? [],
      discharge_efficiency_curve:
        normalizeEfficiencyCurve(b.discharge_efficiency_curve) ?? []
    },
    grid: {
      max_export_power_kw: Number(g.max_export_power_kw ?? g.maxExportKw ?? 0)
    }
  }

  return components
}
