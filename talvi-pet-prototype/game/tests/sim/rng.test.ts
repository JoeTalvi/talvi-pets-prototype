import { describe, expect, it } from 'vitest';
import { mulberry32, petSeed } from '@sim/rng';
describe('seed kernel', () => {
  it('VERIFY-WORK-001-02 mulberry32 matches a known sequence and round-trips its cursor', () => {
    const first = mulberry32(1); expect(first.value).toBeCloseTo(0.6270739405881613, 12);
    expect(mulberry32(first.seed).value).toBeCloseTo(0.002735721180215478, 12);
    expect(mulberry32(JSON.parse(JSON.stringify(first)).seed)).toEqual(mulberry32(first.seed));
  });
});

it('CONTRACT-STATE RNG derives independent unsigned pet cursors in content order', () => {
  expect(petSeed(1, 0)).toBe(2654435768);
  expect(petSeed(1, 1)).toBe(1013904243);
  expect(petSeed(-1, 0)).toBe(1640531526);
  let feed = 1, dog = petSeed(1, 0), owl = petSeed(1, 1);
  const feedOnly: number[] = [], interleaved: number[] = [];
  for (let index = 0; index < 50; index++) {
    const result = mulberry32(feed); feed = result.seed; feedOnly.push(result.value);
  }
  feed = 1;
  for (let index = 0; index < 50; index++) {
    dog = mulberry32(dog).seed; owl = mulberry32(owl).seed;
    const result = mulberry32(feed); feed = result.seed; interleaved.push(result.value);
  }
  expect(interleaved).toEqual(feedOnly);
  expect(dog).not.toBe(owl);
});
