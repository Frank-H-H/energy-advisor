import { simulateTimeSeries } from './time-series.js';

export class ForecastEngine {
  static run(input = {}) {
    const intervals = input.intervals || [];
    const components = input.components || {};
    const initialBatteryEnergy =
      input.state?.batteryEnergyKwh ?? components.battery?.soc_kwh ?? 0;

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
    const durationMs = end.getTime() - start.getTime();

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('forecast interval must have a positive duration');
    }

    return {
      start,
      end,
      productionPowerKw: Number(interval.energy?.productionPowerKw ?? 0),
      consumptionPowerKw: Number(interval.energy?.consumptionPowerKw ?? 0),
      gridTargetPowerKw: Number(interval.grid?.targetPowerKw ?? 0),
      prematureExportPowerKw: Number(interval.grid?.prematureExportPowerKw ?? 0),
      extraConsumptionPowerKw: Number(interval.loads?.extraPowerKw ?? 0),
      extraConsumptionEndsAt: interval.loads?.extraEndsAt
        ? new Date(interval.loads.extraEndsAt)
        : undefined,
      importPricePerKwh: interval.price?.buyPerKwh ?? null,
      exportPricePerKwh: interval.price?.sellPerKwh ?? null,
    };
  }

  static toForecastInterval(interval, timestep) {
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

    const importPricePerKwh = interval.price?.buyPerKwh ?? null;

    const exportPricePerKwh = interval.price?.sellPerKwh ?? null;

    return {
      start: interval.start,
      end: interval.end,

      durationMs:
        interval.durationMs ??
        new Date(interval.end).getTime() - new Date(interval.start).getTime(),

      values: {
        consumption_kwh: Number(interval.consumptionPowerKw ?? 0) *
          (new Date(interval.end).getTime() - new Date(interval.start).getTime()) /
          3600000,

        pv_kwh: Number(interval.productionPowerKw ?? 0) *
          (new Date(interval.end).getTime() - new Date(interval.start).getTime()) /
          3600000,

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
