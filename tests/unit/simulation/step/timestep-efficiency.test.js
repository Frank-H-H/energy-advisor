import { describe, it, expect } from 'vitest';
import { simulateTimestep } from '../../../../src/simulation/timestep.js';
import {
  defaultSimpleTestSettingsForPartialStepFixture,
  defaultSimpleTestSettingsForFullStepFixture,
  expectStandardNextStateAttributesPresent,
} from '../../../helpers/simulation.js';

describe('simulateTimestep - power dependent efficiencies', () => {
  describe('charging with losses', () => {
    it('reduces the SOC gain by a constant charge efficiency curve', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          productionPowerKw: 6,
        },
        {
          charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.5 }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 6 kW * (10/60) h * 0.5 = 0.5 kWh SOC gain
      expect(
        nextState.batteryEnergyAtEndKwh,
        'expected SOC change = 6 kW * (10/60)h * 0.5 = 0.5 kWh'
      ).toBeCloseTo(20.5, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });

    it('uses the interpolated charge efficiency from the curve', () => {
      const testFixture = defaultSimpleTestSettingsForPartialStepFixture(
        {},
        {
          productionPowerKw: 6,
        },
        {
          charge_efficiency_curve: [
            { up_to_kw: 5, efficiency: 0.98 },
            { up_to_kw: 8, efficiency: 0.96 },
          ],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 6 kW: interpolated efficiency 0.97333 => 6 * (10/60) * 0.97333
      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(
        20 + 6 * (10 / 60) * (0.98 - (1 / 3) * 0.02),
        6
      );
    });

    it('exports the full surplus after the battery reaches full earlier', () => {
      // SOC rate with efficiency 0.5: 3 kW => 0.2 kWh missing => 4 min
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 42.8 },
        {
          productionPowerKw: 6,
        },
        {
          charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.5 }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(43, 6);
      // battery full after 4 min, remaining 11 min are exported: 6 * (11/60)
      expect(nextState.exportedEnergyKwh).toBeCloseTo(1.1, 6);
      expect(nextState.importedEnergyKwh).toBeCloseTo(0, 6);
    });
  });

  describe('discharging with losses', () => {
    it('increases the SOC loss by a constant discharge efficiency curve', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          consumptionPowerKw: 4,
        },
        {
          discharge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.5 }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // delivered 4 kW * (15/60) h = 1 kWh, SOC loss = 1 / 0.5 = 2 kWh
      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(18, 6);
      expectStandardNextStateAttributesPresent(nextState);
    });

    it('imports the remaining demand after the battery empties earlier', () => {
      // SOC draw rate with efficiency 0.5: 8 kW => 1 kWh available lasts
      // 7.5 min; remaining 7.5 min are imported: 4 kW * 0.125 h = 0.5 kWh
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        { batteryEnergyAtStartKwh: 1 },
        {
          consumptionPowerKw: 4,
        },
        {
          discharge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.5 }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(0, 6);
      expect(nextState.importedEnergyKwh).toBeCloseTo(0.5, 6);
      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
    });

    it('keeps low power discharge loss-free when configured as such', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          consumptionPowerKw: 0.5,
        },
        {
          discharge_efficiency_curve: [
            { up_to_kw: 0.5, efficiency: 1 },
            { up_to_kw: 8, efficiency: 0.9 },
          ],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // 0.5 kW is at the first breakpoint => efficiency 1
      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(
        20 - 0.5 * (15 / 60),
        6
      );
    });
  });

  describe('grid accounting stays on the external side', () => {
    it('counts the full external energy when charging with losses', () => {
      const testFixture = defaultSimpleTestSettingsForFullStepFixture(
        {},
        {
          productionPowerKw: 4,
        },
        {
          charge_efficiency_curve: [{ up_to_kw: 0, efficiency: 0.5 }],
        }
      );

      const { nextState } = simulateTimestep(testFixture);

      // grid target 0: all surplus goes into the battery, nothing exported
      expect(nextState.exportedEnergyKwh).toBeCloseTo(0, 6);
      expect(nextState.importedEnergyKwh).toBeCloseTo(0, 6);
      // but only 4 * 0.25 * 0.5 = 0.5 kWh arrive in the battery
      expect(nextState.batteryEnergyAtEndKwh).toBeCloseTo(20.5, 6);
    });
  });
});
