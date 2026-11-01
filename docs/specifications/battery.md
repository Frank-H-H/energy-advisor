# Battery specification

Units:
- capacity, SOC, energy: kWh
- power: kW
- efficiencies: fraction (0..1)

Inputs:
- capacity_kwh
- soc_kwh
- min_soc_kwh
- max_charge_power_kw
- max_discharge_power_kw
- charge_efficiency
- discharge_efficiency
- idle_losses_kw

Behavior:
- charge(energy_kwh) will increase SOC respecting capacity and efficiency and return actual charged kWh
- discharge(requestedEnergy_kwh) will reduce SOC down to min_soc_kwh and report delivered energy

Invariants:
- SOC never exceeds capacity
- SOC never falls below min_soc

Idle losses:
- `idle_losses_kw` is the constant standby power of the whole system in kW (e.g. inverters and accompanying components in idle mode)
- it is configured on the battery config node and subtracted from the power balance of every timestep before battery/grid behaviour is simulated
- default is 0 (disabled)
