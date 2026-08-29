export function makeTimestep(startISO, endISO, values = {}) {
  const start = new Date(startISO)
  const end = new Date(endISO)

  return {
    start,
    end,
    ...values
  }
}

export function makeComponents({
  capacity_kwh = 43,
  max_charge_kw = 8,
  max_discharge_kw = max_charge_kw,
  max_export_kw = 7,
  charge_efficiency = 1,
  discharge_efficiency = 1,
  min_soc_kwh = 0
} = {}) {
  return {
    battery: {
      capacity_kwh,
      max_charge_power_kw: max_charge_kw,
      max_discharge_power_kw: max_discharge_kw,
      charge_efficiency,
      discharge_efficiency,
      min_soc_kwh
    },
    grid: {
      max_export_power_kw: max_export_kw
    }
  }
}