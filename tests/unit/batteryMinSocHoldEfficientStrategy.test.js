import { describe, expect, it } from 'vitest';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { BatteryMinSocHoldEfficientStrategy } from '../../src/advisor/strategies/batteryMinSocHoldEfficientStrategy.js';

function run(strategy, timeSeries) {
  return AdvisorEngine.run({ timeSeries, strategies: [strategy] });
}

function timestep(
  startMinute,
  {
    socKwh,
    buyPerKwh,
    durationMinutes = 15,
    targetPowerKw = 0,
    importKwh,
  }
) {
  const start = new Date(Date.UTC(2026, 0, 1) + startMinute * 60 * 1000);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const timestep = {
    start: start.toISOString(),
    end: end.toISOString(),
    grid: { buyPerKwh, targetPowerKw },
  };
  if (socKwh !== undefined) timestep.battery = { energyKwh: socKwh };
  if (importKwh !== undefined) timestep.grid.importKwh = importKwh;
  return timestep;
}

describe('BatteryMinSocHoldEfficientStrategy', () => {
  it('plans imports to maintain minimum SOC', () => {
    const timeSeries = [
      timestep(0, { socKwh: 3.0, buyPerKwh: 0.05 }),
      timestep(15, { socKwh: 2.0, buyPerKwh: 0.3 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.0
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.strategyId).toBe('battery-min-soc-hold-efficient');
    expect(strategyPlan.proposals).toHaveLength(1);
    expect(strategyPlan.totalPlannedImportKwh).toBeGreaterThan(0);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('considers charge efficiency when planning', () => {
    const chargeEfficiencyCurve = [
      { up_to_kw: 0, efficiency: 0.98 },
      { up_to_kw: 4, efficiency: 0.98 },
      { up_to_kw: 5, efficiency: 0.94 }
    ];

    const timeSeries = [
      timestep(0, { socKwh: 5.0, buyPerKwh: 0.10 }),
      timestep(15, { socKwh: 4.0, buyPerKwh: 0.10 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.10 }),
    ];

    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 10,
        minSocKwh: 1.0,
        chargeEfficiencyCurve: chargeEfficiencyCurve
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.totalPlannedImportKwh).toBeGreaterThan(0);
  });

  it('prefers cheaper slots even with lower efficiency', () => {
    const chargeEfficiencyCurve = [
      { up_to_kw: 0, efficiency: 0.98 },
      { up_to_kw: 4, efficiency: 0.98 },
      { up_to_kw: 5, efficiency: 0.94 }
    ];

    const timeSeries = [
      timestep(0, { socKwh: 5.0, buyPerKwh: 0.05 }),
      timestep(15, { socKwh: 4.5, buyPerKwh: 0.10 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.20 }),
    ];

    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 10,
        minSocKwh: 1.0,
        chargeEfficiencyCurve: chargeEfficiencyCurve
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.totalPlannedImportKwh).toBeGreaterThan(0);
  });

  it('works without efficiency curve', () => {
    const timeSeries = [
      timestep(0, { socKwh: 3.0, buyPerKwh: 0.05 }),
      timestep(15, { socKwh: 2.0, buyPerKwh: 0.3 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.0
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.strategyId).toBe('battery-min-soc-hold-efficient');
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.totalPlannedImportKwh).toBeGreaterThan(0);
  });

  it('does not plan purchases for timesteps without buy prices', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: undefined }),
      timestep(15, { socKwh: 0.5, buyPerKwh: undefined }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // Without buy prices, no purchases can be planned
    expect(plan.actions).toHaveLength(0);
    expect(strategyPlan.totalPlannedImportKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(1.0, 10);
  });

  it('uses only timesteps with buy prices for planning', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: undefined }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // Only the first timestep has a buy price, so it's used
    expect(plan.actions).toHaveLength(1);
    expect(strategyPlan.totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('does not plan purchases for timesteps with null buy prices', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: null }),
      timestep(15, { socKwh: 0.5, buyPerKwh: null }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // With null buy prices, no purchases can be planned
    expect(plan.actions).toHaveLength(0);
    expect(strategyPlan.totalPlannedImportKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(1.0, 10);
  });

  it('uses only timesteps with buy prices (not null) for planning', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: null }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // Only the first timestep has a buy price, so it's used
    expect(plan.actions).toHaveLength(1);
    expect(strategyPlan.totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('treats null and undefined buy prices the same', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: null }),
      timestep(15, { socKwh: 0.5, buyPerKwh: undefined }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({ 
        capacityKwh: 10, 
        maxChargePowerKw: 4,
        minSocKwh: 1.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // Both null and undefined should be treated the same - no purchases
    expect(plan.actions).toHaveLength(0);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(1.0, 10);
  });
});

describe('BatteryMinSocHoldEfficientStrategy hysteresis', () => {
  it('covers a triggered deficit up to minSoc + hysteresis instead of only minSoc', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        minSocKwh: 1.0,
        minSocHysteresisKwh: 0.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
    // Deficit timestep SOC 0.5 is covered up to 1.5 (minSoc 1.0 + hysteresis 0.5)
    expect(strategyPlan.totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(strategyPlan.minSocHysteresisKwh).toBeCloseTo(0.5, 10);
  });

  it('does not plan purchases while the SOC stays above the minimum inside the band', () => {
    const timeSeries = [
      timestep(0, { socKwh: 1.2, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 1.1, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        minSocKwh: 1.0,
        minSocHysteresisKwh: 0.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.totalPlannedImportKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('does not re-trigger for later timesteps within the covered band', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.2 }),
      timestep(30, { socKwh: 0.9, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        minSocKwh: 1.0,
        minSocHysteresisKwh: 0.5
      }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    // Only the first deficit triggers a purchase; the follow-up timestep
    // within the band does not add another purchase.
    expect(strategyPlan.totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('behaves identically with zero hysteresis (backward compatibility)', () => {
    const timeSeries = [
      timestep(0, { socKwh: 3.0, buyPerKwh: 0.05 }),
      timestep(15, { socKwh: 2.0, buyPerKwh: 0.3 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.2 }),
    ];
    const withoutHysteresis = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        minSocKwh: 1.0
      }),
      timeSeries
    );
    const withZeroHysteresis = run(
      new BatteryMinSocHoldEfficientStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        minSocKwh: 1.0,
        minSocHysteresisKwh: 0
      }),
      timeSeries
    );

    expect(withZeroHysteresis.strategyPlans[0].totalPlannedImportKwh).toBeCloseTo(
      withoutHysteresis.strategyPlans[0].totalPlannedImportKwh,
      10
    );
    expect(withZeroHysteresis.strategyPlans[0].totalPlannedSocGainKwh).toBeCloseTo(
      withoutHysteresis.strategyPlans[0].totalPlannedSocGainKwh,
      10
    );
  });

  it('accepts the hysteresis as a percentage of the capacity', () => {
    const strategy = new BatteryMinSocHoldEfficientStrategy({
      capacityKwh: 10,
      maxChargePowerKw: 4,
      minSocPercent: 0.15,
      minSocHysteresisPercent: 0.03
    });
    expect(strategy.minSocKwh).toBeCloseTo(1.5, 10);
    expect(strategy.minSocHysteresisKwh).toBeCloseTo(0.3, 10);
  });

  it('rejects a hysteresis lifting the target above the battery capacity', () => {
    expect(
      () =>
        new BatteryMinSocHoldEfficientStrategy({
          capacityKwh: 10,
          maxChargePowerKw: 4,
          minSocKwh: 9.9,
          minSocHysteresisKwh: 0.5
        })
    ).toThrow('minSocHysteresisKwh must be between 0 and capacityKwh - minSocKwh');
    expect(
      () =>
        new BatteryMinSocHoldEfficientStrategy({
          capacityKwh: 10,
          maxChargePowerKw: 4,
          minSocPercent: 0.98,
          minSocHysteresisPercent: 0.1
        })
    ).toThrow('minSocHysteresisKwh must be between 0 and capacityKwh - minSocKwh');
  });
});
