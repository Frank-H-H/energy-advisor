// time-series utilities

export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

export function normalizeToUTCISOString(ts) {
  const d = new Date(ts)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())).toISOString()
}

export function createIntervals({ startISO, periods, intervalMs = DEFAULT_INTERVAL_MS, values = [] }) {
  const start = new Date(startISO)
  const intervals = []
  for (let i = 0; i < periods; i++) {
    const s = new Date(start.getTime() + i * intervalMs)
    const e = new Date(s.getTime() + intervalMs)
    intervals.push({
      index: i,
      start: s.toISOString(),
      end: e.toISOString(),
      durationMs: intervalMs,
      values: values[i] || {}
    })
  }
  return intervals
}
