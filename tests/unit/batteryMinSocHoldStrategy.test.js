import { describe, expect, it } from 'vitest';
import { AdvisorEngine } from '../../src/advisor/advisorEngine.js';
import { BatteryMinSocHoldStrategy } from '../../src/advisor/strategies/batteryMinSocHoldStrategy.js';

function run(strategy, timeSeries) {
  return AdvisorEngine.run({ timeSeries, strategies: [strategy] });
}

function timestep(
  startMinute,
  { socKwh, buyPerKwh, durationMinutes = 15, targetPowerKw = 0 }
) {
  const start = new Date(
    '2026-01-01T00:' + String(startMinute).padStart(2, '0') + ':00Z'
  );
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const timestep = {
    start: start.toISOString(),
    end: end.toISOString(),
    grid: { buyPerKwh, targetPowerKw },
  };
  if (socKwh !== undefined) timestep.battery = { energyKwh: socKwh };
  return timestep;
}

describe('BatteryMinSocHoldStrategy', () => {
  it('plans an import at the cheapest earlier timestep when the SOC falls below the minimum', () => {
    const timeSeries = [
      timestep(0, { socKwh: 3.0, buyPerKwh: 0.05 }),
      timestep(15, { socKwh: 2.0, buyPerKwh: 0.3 }),
      timestep(30, { socKwh: 0.5, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    const strategyPlan = plan.strategyPlans[0];
    expect(strategyPlan.strategyId).toBe('battery-min-soc-hold');
    expect(strategyPlan.proposals).toHaveLength(1);
    expect(strategyPlan.proposals[0]).toMatchObject({
      strategyId: 'battery-min-soc-hold',
      priority: 50,
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      type: 'set-grid-target',
      gridTargetPowerKw: 4,
      reason: 'HOLD_BATTERY_MIN_SOC',
    });
    expect(plan.actions[0].start.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z'
    );
    expect(plan.actions[0].end.toISOString()).toBe(
      '2026-01-01T00:15:00.000Z'
    );
    expect(strategyPlan.uncoveredDeficitKwh).toBeCloseTo(0, 10);
    expect(strategyPlan.totalPlannedImportKwh).toBeCloseTo(1.0, 10);
  });

  it('covers a later deficit with a single earlier purchase', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.3 }),
      timestep(15, { socKwh: 1.0, buyPerKwh: 0.1 }),
      timestep(30, { socKwh: 1.2, buyPerKwh: 0.05 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    // The purchase in the cheapest deficit timestep (t1) lifts the SOC of
    // all later timesteps, so the small deficit at t2 needs no purchase.
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(2, 10);
    expect(plan.actions[0].start.toISOString()).toBe(
      '2026-01-01T00:15:00.000Z'
    );
  });

  it('allows the SOC to sit exactly on the minimum', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 1.5, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(0);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('includes the charge efficiency and spills to the next cheapest timestep', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        chargeEfficiencyCurve: [{ up_to_kw: 0, efficiency: 0.5 }],
      }),
      timeSeries
    );

    // Required SOC gain is 1.0 kWh. At 50% efficiency one timestep at
    // full 4 kW can only store 0.5 kWh, so both timesteps are used.
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(4, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(4, 10);
    expect(plan.strategyPlans[0].totalPlannedImportKwh).toBeCloseTo(2.0, 10);
    expect(plan.strategyPlans[0].totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('buys as much as possible and reports the uncovered deficit when the charge power is insufficient', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 1 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(1, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(1, 10);
    expect(plan.strategyPlans[0].totalPlannedImportKwh).toBeCloseTo(0.5, 10);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(1.0, 10);
  });

  it('charges even without buy prices (hard guarantee), earliest timestep first', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: undefined }),
      timestep(15, { socKwh: 0.5, buyPerKwh: undefined }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(4, 10);
    expect(plan.strategyPlans[0].totalPlannedSocGainKwh).toBeCloseTo(1.0, 10);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('does not plan anything without a deficit', () => {
    const timeSeries = [
      timestep(0, { socKwh: 9, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 8, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(0);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('adds the import on top of the existing grid target', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1, targetPowerKw: 1.5 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.3, targetPowerKw: 0 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(5.5, 10);
  });

  it('solves the power dependent charge efficiency exactly when uncapped', () => {
    const curve = [
      { up_to_kw: 2, efficiency: 1 },
      { up_to_kw: 4, efficiency: 0.8 },
    ];
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 1.0, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        chargeEfficiencyCurve: curve,
      }),
      timeSeries
    );

    // Required SOC gain 0.5 kWh at 2 kW charge power has efficiency 1,
    // so exactly 0.5 kWh are bought without losses.
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(2, 10);
    expect(plan.actions[0].expectedBenefit.estimatedImportKwh).toBeCloseTo(
      0.5,
      10
    );
  });

  it('caps at the max charge power with a power dependent curve and buys the remainder later', () => {
    const curve = [
      { up_to_kw: 2, efficiency: 1 },
      { up_to_kw: 4, efficiency: 0.8 },
    ];
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({
        capacityKwh: 10,
        maxChargePowerKw: 4,
        chargeEfficiencyCurve: curve,
      }),
      timeSeries
    );

    // Required SOC gain 1.0 kWh: at full power the efficiency is 0.8, so
    // the first timestep stores 0.8 kWh and the remaining 0.2 kWh are
    // bought in the deficit timestep itself (0.8 kW for 15 minutes).
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(4, 10);
    expect(plan.actions[1].gridTargetPowerKw).toBeCloseTo(0.8, 10);
    expect(plan.strategyPlans[0].uncoveredDeficitKwh).toBeCloseTo(0, 10);
  });

  it('defaults the minimum SOC to 15% of the capacity', () => {
    const timeSeries = [
      timestep(0, { socKwh: 5.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 2.9, buyPerKwh: 0.2 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 20, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.strategyPlans[0].minSocKwh).toBeCloseTo(3, 10);
    expect(plan.actions).toHaveLength(1);
    expect(plan.strategyPlans[0].totalPlannedImportKwh).toBeCloseTo(0.1, 10);
  });

  it('treats timesteps without battery data as purchase candidates but never as deficits', () => {
    const timeSeries = [
      { ...timestep(0, { buyPerKwh: 0.05 }) },
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.3 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(4, 10);
  });

  it('uses TimeSeries duration even when timestep lengths differ', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1, durationMinutes: 60 }),
      timestep(60, { socKwh: 0.5, buyPerKwh: 0.3, durationMinutes: 15 }),
    ];
    const plan = run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 2 }),
      timeSeries
    );

    // One hour at 2 kW stores the whole required 1.0 kWh in the first
    // timestep.
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].gridTargetPowerKw).toBeCloseTo(2, 10);
  });

  it('rejects a timestep with non-positive duration', () => {
    const timeSeries = [
      {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-01T00:00:00Z',
        battery: { energyKwh: 1 },
        grid: { buyPerKwh: 0.1, targetPowerKw: 0 },
      },
    ];

    expect(() =>
      run(
        new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
        timeSeries
      )
    ).toThrow('TimeSeries timestep must have a positive duration');
  });

  it('does not mutate the TimeSeries', () => {
    const timeSeries = [
      timestep(0, { socKwh: 2.0, buyPerKwh: 0.1 }),
      timestep(15, { socKwh: 0.5, buyPerKwh: 0.3 }),
    ];
    const original = structuredClone(timeSeries);
    run(
      new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: 4 }),
      timeSeries
    );
    expect(timeSeries).toEqual(original);
  });

  it('validates its configuration', () => {
    expect(
      () => new BatteryMinSocHoldStrategy({ capacityKwh: 0, maxChargePowerKw: 1 })
    ).toThrow('capacityKwh must be a positive finite number');
    expect(
      () =>
        new BatteryMinSocHoldStrategy({
          capacityKwh: 10,
          minSocKwh: 11,
          maxChargePowerKw: 1,
        })
    ).toThrow('minSocKwh must be between 0 and capacityKwh');
    expect(
      () => new BatteryMinSocHoldStrategy({ capacityKwh: 10, maxChargePowerKw: -1 })
    ).toThrow('maxChargePowerKw must be a non-negative finite number');
    expect(
      () =>
        new BatteryMinSocHoldStrategy({
          capacityKwh: 10,
          maxChargePowerKw: 1,
          priority: 'high',
        })
    ).toThrow('priority must be a finite number');
  });
});
