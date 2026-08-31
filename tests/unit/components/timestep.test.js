import { describe, expect, it } from 'vitest';
import { Timestep } from '../../../src/components/timestep.js';

describe('Timestep', () => {
  const start = new Date('2026-01-01T10:00:00Z');
  const end = new Date('2026-01-01T11:30:00Z');

  it('creates a timestep and exposes its duration', () => {
    const timestep = new Timestep({ start, end, value: 42 });

    expect(timestep.start).toEqual(start);
    expect(timestep.end).toEqual(end);
    expect(timestep.durationMinutes).toBe(90);
    expect(timestep.durationHours).toBe(1.5);
    expect(timestep.value).toBe(42);
  });

  it('creates a timestep from an existing timestep-like object', () => {
    const source = {
      start,
      end,
      expectedProductionPowerKw: 5,
    };

    const timestep = Timestep.from(source);

    expect(timestep.start).toEqual(start);
    expect(timestep.end).toEqual(end);
    expect(timestep.expectedProductionPowerKw).toBe(5);
  });

  it('creates an interval between two points inside the timestep', () => {
    const timestep = new Timestep({ start, end, value: 42 });
    const interval = timestep.between(
      new Date('2026-01-01T10:15:00Z'),
      new Date('2026-01-01T11:00:00Z')
    );

    expect(interval.start).toEqual(new Date('2026-01-01T10:15:00Z'));
    expect(interval.end).toEqual(new Date('2026-01-01T11:00:00Z'));
    expect(interval.value).toBe(42);
  });

  it('splits a timestep at a point into two consecutive intervals', () => {
    const timestep = new Timestep({ start, end, value: 42 });
    const point = new Date('2026-01-01T10:30:00Z');

    const [first, second] = timestep.splitAt(point);

    expect(first).toBeInstanceOf(Timestep);
    expect(second).toBeInstanceOf(Timestep);
    expect(first.start).toEqual(start);
    expect(first.end).toEqual(point);
    expect(second.start).toEqual(point);
    expect(second.end).toEqual(end);
    expect(first.value).toBe(42);
    expect(second.value).toBe(42);
    expect(first.durationHours).toBe(0.5);
    expect(second.durationHours).toBe(1);
  });

  it('rejects an invalid timestep', () => {
    expect(
      () =>
        new Timestep({
          start: end,
          end: start,
        })
    ).toThrow('timestep start must be before end');
  });

  it('rejects a split point outside the timestep', () => {
    const timestep = new Timestep({ start, end });

    expect(() => timestep.splitAt(start)).toThrow(
      'split point must be inside timestep'
    );
    expect(() => timestep.splitAt(end)).toThrow(
      'split point must be inside timestep'
    );
  });

  it('rejects an interval outside the timestep', () => {
    const timestep = new Timestep({ start, end });

    expect(() =>
      timestep.between(
        new Date('2026-01-01T09:00:00Z'),
        new Date('2026-01-01T10:30:00Z')
      )
    ).toThrow('interval must be within timestep');
  });
});
