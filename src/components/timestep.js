import { differenceInMinutes, isBefore, isEqual } from 'date-fns';

/**
 * Domain object representing the time interval of a simulation timestep.
 *
 * Timestep is intentionally responsible only for temporal concerns. It does
 * not contain simulation or energy-domain logic.
 */
export class Timestep {
  constructor(values = {}) {
    if (!values.start || !values.end) {
      throw new Error('timestep with start and end required');
    }

    this.start = new Date(values.start);
    this.end = new Date(values.end);

    if (!isBefore(this.start, this.end)) {
      throw new Error('timestep start must be before end');
    }

    Object.assign(this, values);
    this.start = new Date(values.start);
    this.end = new Date(values.end);
  }

  static from(timestep) {
    return new Timestep(timestep);
  }

  get durationMinutes() {
    return differenceInMinutes(this.end, this.start);
  }

  get durationHours() {
    return this.durationMinutes / 60;
  }

  between(start, end) {
    if (isBefore(start, this.start) || isBefore(this.end, end)) {
      throw new Error('interval must be within timestep');
    }

    return new Timestep({
      ...this,
      start: new Date(start),
      end: new Date(end),
    });
  }

  splitAt(point) {
    if (!isBefore(this.start, point) || !isBefore(point, this.end)) {
      throw new Error('split point must be inside timestep');
    }

    return [this.between(this.start, point), this.between(point, this.end)];
  }

  equals(other) {
    return (
      other instanceof Timestep &&
      isEqual(this.start, other.start) &&
      isEqual(this.end, other.end)
    );
  }
}
