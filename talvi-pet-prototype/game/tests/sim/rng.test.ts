import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@sim/rng';
describe('seed kernel', () => {
  it('VERIFY-WORK-001-02 mulberry32 matches a known sequence and round-trips its cursor', () => {
    const first = mulberry32(1); expect(first.value).toBeCloseTo(0.6270739405881613, 12);
    expect(mulberry32(first.seed).value).toBeCloseTo(0.002735721180215478, 12);
    expect(mulberry32(JSON.parse(JSON.stringify(first)).seed)).toEqual(mulberry32(first.seed));
  });
});
