/**
 * Read a value from an object using a dot-separated property path.
 *
 * @param {Object} object Object to read from.
 * @param {string} path Property path, e.g. "payload.attributes.data".
 * @returns {*} The value at the path, or undefined when it does not exist.
 */
export function getPath(object, path) {
  if (!path) return object;
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((value, key) => value?.[key], object);
}

/**
 * Extract generic time/value entries from a message attribute.
 *
 * @param {Object} source Root object containing the array.
 * @param {Object} options
 * @param {string} options.path Path to the array relative to source.
 * @param {string} options.startField Start-time field/path inside each entry.
 * @param {string} options.endField End-time field/path inside each entry.
 * @param {string} options.valueField Value field/path inside each entry.
 * @returns {{entries: Array<{startMs:number,endMs:number,value:number}>, skipped:number}}
 */
export function extractTimeSeriesValues(
  source,
  { path, startField = 'start', endField = 'end', valueField = 'value' } = {}
) {
  const values = getPath(source, path);
  if (!Array.isArray(values)) {
    throw new Error(`Time-series value path must point to an array: ${path}`);
  }

  const entries = [];
  let skipped = 0;

  for (const item of values) {
    const startMs = new Date(getPath(item, startField)).getTime();
    const endMs = new Date(getPath(item, endField)).getTime();
    const value = Number(getPath(item, valueField));

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !Number.isFinite(value)) {
      skipped += 1;
      continue;
    }

    entries.push({ startMs, endMs, value });
  }

  entries.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  return { entries, skipped };
}

/**
 * Find the value for a target interval.
 *
 * Matching rules, in order:
 * 1. An exact source interval wins.
 * 2. A single larger source interval containing the target wins.
 * 3. Smaller source intervals are accepted when they completely and
 *    continuously cover the target; their values are averaged arithmetically.
 *
 * @param {Array<{startMs:number,endMs:number,value:number}>} entries Source entries.
 * @param {string|Date|number} targetStart Target interval start.
 * @param {string|Date|number} targetEnd Target interval end.
 * @returns {number|null}
 */
export function findTimeSeriesValue(entries, targetStart, targetEnd) {
  const startMs = new Date(targetStart).getTime();
  const endMs = new Date(targetEnd).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Target interval must have valid start and end times');
  }

  const exact = entries.find(
    (entry) => entry.startMs === startMs && entry.endMs === endMs
  );
  if (exact) return exact.value;

  const containing = entries
    .filter((entry) => entry.startMs <= startMs && entry.endMs >= endMs)
    .sort((left, right) => (left.endMs - left.startMs) - (right.endMs - right.startMs));
  if (containing.length > 0) return containing[0].value;

  const smaller = entries
    .filter((entry) => entry.startMs >= startMs && entry.endMs <= endMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  if (smaller.length === 0) return null;

  let cursor = startMs;
  for (const entry of smaller) {
    if (entry.startMs !== cursor) return null;
    cursor = entry.endMs;
    if (cursor === endMs) {
      return smaller
        .filter((candidate) => candidate.startMs >= startMs && candidate.endMs <= endMs)
        .reduce((sum, candidate) => sum + candidate.value, 0) / smaller.length;
    }
    if (cursor > endMs) return null;
  }

  return null;
}

/**
 * Apply generic time-series values to a TimeSeries using a callback.
 *
 * @param {Array<Object>} timeSeries TimeSeries to modify.
 * @param {Array<{startMs:number,endMs:number,value:number}>} entries Source entries.
 * @param {(timestep:Object,value:number|null)=>void} applyValue Callback receiving each value.
 * @returns {{matched:number,missing:number}}
 */
export function applyTimeSeriesValues(timeSeries, entries, applyValue) {
  if (!Array.isArray(timeSeries)) throw new Error('timeSeries must be an array');
  if (!Array.isArray(entries)) throw new Error('entries must be an array');
  if (typeof applyValue !== 'function') throw new Error('applyValue must be a function');

  let matched = 0;
  let missing = 0;

  for (const timestep of timeSeries) {
    const value = findTimeSeriesValue(entries, timestep.start, timestep.end);
    applyValue(timestep, value);
    if (value === null) missing += 1;
    else matched += 1;
  }

  return { matched, missing };
}
