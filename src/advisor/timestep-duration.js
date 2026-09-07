/**
 * Returns the duration of a TimeSeries timestep in hours.
 * The TimeSeries start/end timestamps are the single source of truth.
 */
export function getTimestepDurationHours(start, end) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const durationHours = (endDate.getTime() - startDate.getTime()) / 3600000;

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    throw new Error('TimeSeries timestep must have a positive duration');
  }

  return durationHours;
}
