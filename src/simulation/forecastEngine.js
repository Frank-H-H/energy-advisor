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
      productionPowerKw: Number(interval.solar?.productionPowerKw ?? 0),
      consumptionPowerKw: Number(interval.load?.consumptionPowerKw ?? 0),
      gridTargetPowerKw: Number(interval.grid?.targetPowerKw ?? 0),
      extraConsumptionPowerKw: Number(interval.load?.extraPowerKw ?? 0),
      extraConsumptionEndsAt: interval.load?.extraEndsAt
        ? new Date(interval.load.extraEndsAt)
        : undefined,
      importPricePerKwh: interval.grid?.buyPerKwh ?? null,
      exportPricePerKwh: interval.grid?.sellPerKwh ?? null,
    };
  }

  static toForecastInterval(interval, timestep) {
    const batteryEnergyAtStartKwh = timestep.batteryEnergyAtStartKwh ?? 0;
    const batteryEnergyAtEndKwh =
      timestep.batteryEnergyAtEndKwh ?? batteryEnergyAtStartKwh;
    const batteryChargeKwh = Math.max(
      0,
      batteryEnergyAtEndKwh - batteryEnergyAtStartKwh
    );
    const batteryDischargeKwh = Math.max(
      0,
      batteryEnergyAtStartKwh - batteryEnergyAtEndKwh
    );
    const gridImportKwh = timestep.importedEnergyKwh ?? 0;
    const gridExportKwh = timestep.exportedEnergyKwh ?? 0;
    const buyPerKwh = interval.grid?.buyPerKwh ?? null;
    const sellPerKwh = interval.grid?.sellPerKwh ?? null;

    return {
      start: interval.start,
      end: interval.end,
      durationMs:
        interval.durationMs ??
        new Date(interval.end).getTime() - new Date(interval.start).getTime(),
      solar: {
        productionPowerKw: Number(interval.solar?.productionPowerKw ?? 0),
        missedProductionKwh: timestep.missedProductionEnergyKwh ?? 0,
      },
      load: {
        consumptionPowerKw: Number(interval.load?.consumptionPowerKw ?? 0),
        extraConsumptionKwh: timestep.extraConsumedEnergyKwh ?? 0,
      },
      battery: {
        energyKwh: batteryEnergyAtEndKwh,
        chargeKwh: batteryChargeKwh,
        dischargeKwh: batteryDischargeKwh,
      },
      grid: {
        targetPowerKw: Number(interval.grid?.targetPowerKw ?? 0),
        importKwh: gridImportKwh,
        exportKwh: gridExportKwh,
        buyPerKwh,
        sellPerKwh,
      },
      economics: {
        cost: gridImportKwh * (buyPerKwh ?? 0),
        revenue: gridExportKwh * (sellPerKwh ?? 0),
      },
    };
  }
}
