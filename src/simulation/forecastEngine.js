import { simulateTimeSeries } from './time-series.js';

export class ForecastEngine {
  static run(input = {}) {
    const intervals = input.intervals || [];
    const components = input.components || {};
    const initialBatteryEnergy = components.battery?.soc_kwh ?? 0;

    const timesteps = intervals.map((interval) => this.toTimestep(interval));

    const simulation = simulateTimeSeries({
      state: {
        batteryEnergyAtStartKwh: initialBatteryEnergy,
      },
      timesteps,
      components,
    });

    return simulation.timesteps.map((timestep, index) =>
      this.toForecastInterval(intervals[index], timestep)
    );
  }

  static toTimestep(interval) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    const durationHours = (end.getTime() - start.getTime()) / 3600000;

    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      throw new Error('forecast interval must have a positive duration');
    }

    const values = interval.values || {};

    return {
      start,
      end,

      expectedProductionPowerKw: Number(values.pv_kwh ?? 0) / durationHours,

      expectedConsumptionPowerKw:
        Number(values.consumption_kwh ?? 0) / durationHours,

      gridTargetPowerKw: Number(values.gridTargetPowerKw ?? 0),

      prematureExportPowerKw: Number(values.prematureExportPowerKw ?? 0),

      extraConsumptionPowerKw: Number(values.extraConsumptionPowerKw ?? 0),

      extraConsumptionEndsAt: values.extraConsumptionEndsAt
        ? new Date(values.extraConsumptionEndsAt)
        : undefined,

      importPricePerKwh: values.importPricePerKwh ?? null,
      exportPricePerKwh: values.exportPricePerKwh ?? null,
    };
  }

  static toForecastInterval(interval, timestep) {
    const values = interval.values || {};

    const batteryEnergyAtStartKwh = timestep.batteryEnergyAtStartKwh ?? 0;

    const batteryEnergyAtEndKwh =
      timestep.batteryEnergyAtEndKwh ?? batteryEnergyAtStartKwh;

    const batteryChargeKWh = Math.max(
      0,
      batteryEnergyAtEndKwh - batteryEnergyAtStartKwh
    );

    const batteryDischargeKWh = Math.max(
      0,
      batteryEnergyAtStartKwh - batteryEnergyAtEndKwh
    );

    const gridImportKWh = timestep.importedEnergyKwh ?? 0;

    const gridExportKWh = timestep.exportedEnergyKwh ?? 0;

    const importPricePerKwh = values.importPricePerKwh ?? null;

    const exportPricePerKwh = values.exportPricePerKwh ?? null;

    return {
      start: interval.start,
      end: interval.end,

      durationMs:
        interval.durationMs ??
        new Date(interval.end).getTime() - new Date(interval.start).getTime(),

      values: {
        consumption_kwh: Number(values.consumption_kwh ?? 0),

        pv_kwh: Number(values.pv_kwh ?? 0),

        battery_soc_kwh: batteryEnergyAtEndKwh,

        battery_charge_kwh: batteryChargeKWh,

        battery_discharge_kwh: batteryDischargeKWh,

        grid_import_kwh: gridImportKWh,

        grid_export_kwh: gridExportKWh,

        importPricePerKwh,
        exportPricePerKwh,

        cost: gridImportKWh * (importPricePerKwh ?? 0),

        revenue: gridExportKWh * (exportPricePerKwh ?? 0),
      },
    };
  }
}
