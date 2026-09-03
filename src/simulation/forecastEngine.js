import { simulateTimeSeries } from './time-series.js';

export class ForecastEngine {
  static run(input = {}) {
    const timeSeries = input.timeSeries || [];
    const components = input.components || {};
    const initialBatteryEnergy =
      input.state?.batteryEnergyKwh ?? 0;

    const timesteps = timeSeries.map((interval) => this.toTimestep(interval));
    this.applyPlan(timesteps, input.plan);

    const simulation = simulateTimeSeries({
      state: {
        batteryEnergyAtStartKwh: initialBatteryEnergy,
      },
      timesteps,
      components,
    });

    const forecastTimeSeries = simulation.timesteps.map((timestep, index) =>
      this.toForecastInterval(timeSeries[index], timestep)
    );

    return {
      timeSeries: forecastTimeSeries,
      summary: this.createSummary(forecastTimeSeries, initialBatteryEnergy),
    };
  }

  static createSummary(timeSeries, initialBatteryEnergy) {
    const summary = {
      economics: {
        cost: 0,
        revenue: 0,
        netCost: 0,
      },
      grid: {
        importKwh: 0,
        exportKwh: 0,
      },
      solar: {
        productionKwh: 0,
        missedProductionKwh: 0,
      },
      battery: {
        startEnergyKwh: initialBatteryEnergy,
        endEnergyKwh: initialBatteryEnergy,
      },
    };

    for (const interval of timeSeries) {
      const durationHours = interval.durationMs / 3_600_000;

      summary.economics.cost += interval.economics.cost;
      summary.economics.revenue += interval.economics.revenue;
      summary.grid.importKwh += interval.grid.importKwh;
      summary.grid.exportKwh += interval.grid.exportKwh;
      summary.solar.productionKwh +=
        interval.solar.productionPowerKw * durationHours;
      summary.solar.missedProductionKwh += interval.solar.missedProductionKwh;
      summary.battery.endEnergyKwh = interval.battery.energyKwh;
    }

    summary.economics.netCost =
      summary.economics.cost - summary.economics.revenue;

    return summary;
  }

  static applyPlan(timesteps, plan) {
    if (plan === undefined || plan === null) return;
    if (!Array.isArray(plan.actions)) {
      throw new Error('plan.actions must be an array');
    }

    for (const action of plan.actions) {
      if (!action || action.type !== 'set-grid-target') {
        throw new Error('plan action type must be set-grid-target');
      }

      const actionStart = new Date(action.start);
      const actionEnd = new Date(action.end);
      const timestep = timesteps.find(
        (candidate) =>
          candidate.start.getTime() === actionStart.getTime() &&
          candidate.end.getTime() === actionEnd.getTime()
      );

      if (!timestep) {
        throw new Error(
          `plan action ${action.start} - ${action.end} does not match a forecast timestep`
        );
      }

      const gridTargetPowerKw = Number(action.gridTargetPowerKw);
      if (!Number.isFinite(gridTargetPowerKw)) {
        throw new Error('plan action gridTargetPowerKw must be a finite number');
      }

      timestep.gridTargetPowerKw = gridTargetPowerKw;
    }
  }

  static toTimestep(interval) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    const durationMs = end.getTime() - start.getTime();

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('forecast timestep must have a positive duration');
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
        targetPowerKw: Number(timestep.gridTargetPowerKw ?? 0),
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
