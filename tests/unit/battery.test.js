import { Battery } from '../../src/components/battery.js';
import { describe, it, expect } from 'vitest';

describe.skip('Battery basic behavior', () => {
  it('respects capacity and SOC bounds', () => {
    const b = new Battery({ capacity_kwh: 10, soc_kwh: 9, min_soc_kwh: 0 });
    expect(b.soc).toBeLessThanOrEqual(b.capacity);
    expect(b.soc).toBeGreaterThanOrEqual(b.minSoc);
  });
});
