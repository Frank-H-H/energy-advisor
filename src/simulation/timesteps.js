import { simulateTimestep } from './timestep.js';

/**
 * Simulate a sequence of timesteps.
 *
 * The battery state produced by one timestep becomes the starting battery
 * state of the following timestep.
 *
 * The input timesteps are simulated in their given order.
 *
 * @param {Object} options
 * @param {Object} options.state Initial simulation state.
 * @param {Array<Object>} options.timesteps Timesteps to simulate.
 * @param {Object} [options.components] Simulation component configuration.
 * @returns {{nextState: Object, timesteps: Array<Object>}}
 */
export function simulateTimesteps({
  state = {},
  timesteps = [],
  components = {},
}) {
  let currentState = { ...state };
  const simulatedTimesteps = [];

  for (const timestep of timesteps) {
    const result = simulateTimestep({
      state: currentState,
      timestep,
      components,
    });

    simulatedTimesteps.push(result.nextState);
    currentState = {
      ...currentState,
      batteryEnergyAtStart: result.nextState.batteryEnergyAtEnd,
    };
  }

  return {
    nextState: currentState,
    timesteps: simulatedTimesteps,
  };
}
