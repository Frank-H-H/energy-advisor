/**
 * Normalize extra-load input for simulation.
 *
 * An extra load is active for the overlap between its optional start/end
 * window and the current timestep. Missing boundaries mean the containing
 * timestep starts/ends respectively.
 */
export function normalizeExtraLoads(extraLoads) {
  if (!Array.isArray(extraLoads)) {
    return [];
  }

  return extraLoads.map((extraLoad) => ({
    ...extraLoad,
    consumptionPowerKw: Number(extraLoad?.consumptionPowerKw ?? 0),
    start: extraLoad?.start ? new Date(extraLoad.start) : undefined,
    end: extraLoad?.end ? new Date(extraLoad.end) : undefined,
  }));
}

/**
 * Return the extra-load power that is active during a timestep part.
 */
export function getExtraLoadPowerKw(extraLoads, start, end) {
  const intervalStart = new Date(start);
  const intervalEnd = new Date(end);

  return normalizeExtraLoads(extraLoads).reduce((power, extraLoad) => {
    const loadStart = extraLoad.start ?? intervalStart;
    const loadEnd = extraLoad.end ?? intervalEnd;

    if (loadStart < intervalEnd && loadEnd > intervalStart) {
      return power + extraLoad.consumptionPowerKw;
    }

    return power;
  }, 0);
}

/**
 * Return the energy consumed by extra loads during a timestep part.
 */
export function getExtraLoadEnergyKwh(extraLoads, start, end) {
  const intervalStart = new Date(start);
  const intervalEnd = new Date(end);
  const intervalDurationMs = intervalEnd.getTime() - intervalStart.getTime();

  if (intervalDurationMs <= 0) {
    return 0;
  }

  return normalizeExtraLoads(extraLoads).reduce((energy, extraLoad) => {
    const loadStart = extraLoad.start ?? intervalStart;
    const loadEnd = extraLoad.end ?? intervalEnd;
    const overlapStart = Math.max(
      intervalStart.getTime(),
      loadStart.getTime()
    );
    const overlapEnd = Math.min(intervalEnd.getTime(), loadEnd.getTime());

    if (overlapEnd <= overlapStart) {
      return energy;
    }

    return (
      energy +
      extraLoad.consumptionPowerKw *
        ((overlapEnd - overlapStart) / 3600000)
    );
  }, 0);
}

/**
 * Return extra-load start/end points that lie strictly inside the timestep.
 * These points allow the simulation to model a load starting or ending
 * part-way through a timestep without applying its power to the whole part.
 */
export function getExtraLoadBoundaryPoints(extraLoads, timestep) {
  const start = new Date(timestep.start);
  const end = new Date(timestep.end);
  const boundaries = [];

  for (const extraLoad of normalizeExtraLoads(extraLoads)) {
    for (const boundary of [extraLoad.start, extraLoad.end]) {
      if (boundary > start && boundary < end) {
        boundaries.push(boundary);
      }
    }
  }

  return boundaries;
}
