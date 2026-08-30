import { simulateTimeSeries } from './time-series.js';

export class ForecastEngine {
  static run(input = {}) {
    const intervals = input.intervals || [];
    const components = input.components || {};
    const initialBatteryEnergy = components.battery?.soc_kwh ?? 0;

    const timesteps = intervals.map((interval) => this.toTimestep(interval));

    const simulation = simulateTimeSeries({
      state: {
        batteryEnergyAtStart: initialBatteryEnergy,
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

      expectedProductionPower: Number(values.pv_kwh ?? 0) / durationHours,

      expectedConsumptionPower:
        Number(values.consumption_kwh ?? 0) / durationHours,

      gridTarget: Number(values.gridTarget ?? 0),

      prematureExportPower: Number(values.prematureExportPower ?? 0),

      extraConsumptionPower: Number(values.extraConsumptionPower ?? 0),

      extraConsumptionEndsAt: values.extraConsumptionEndsAt
        ? new Date(values.extraConsumptionEndsAt)
        : undefined,

      importPrice: values.importPrice ?? null,
      exportPrice: values.exportPrice ?? null,
    };
  }

  static toForecastInterval(interval, timestep) {
    const values = interval.values || {};

    const batteryEnergyAtStart = timestep.batteryEnergyAtStart ?? 0;

    const batteryEnergyAtEnd =
      timestep.batteryEnergyAtEnd ?? batteryEnergyAtStart;

    const batteryChargeKWh = Math.max(
      0,
      batteryEnergyAtEnd - batteryEnergyAtStart
    );

    const batteryDischargeKWh = Math.max(
      0,
      batteryEnergyAtStart - batteryEnergyAtEnd
    );

    const gridImportKWh = timestep.importedEnergy ?? 0;

    const gridExportKWh = timestep.exportedEnergy ?? 0;

    const importPrice = values.importPrice ?? null;

    const exportPrice = values.exportPrice ?? null;

    return {
      start: interval.start,
      end: interval.end,

      durationMs:
        interval.durationMs ??
        new Date(interval.end).getTime() - new Date(interval.start).getTime(),

      values: {
        consumption_kwh: Number(values.consumption_kwh ?? 0),

        pv_kwh: Number(values.pv_kwh ?? 0),

        battery_soc_kwh: batteryEnergyAtEnd,

        battery_charge_kwh: batteryChargeKWh,

        battery_discharge_kwh: batteryDischargeKWh,

        grid_import_kwh: gridImportKWh,

        grid_export_kwh: gridExportKWh,

        importPrice,
        exportPrice,

        cost: gridImportKWh * (importPrice ?? 0),

        revenue: gridExportKWh * (exportPrice ?? 0),
      },
    };
  }
}
