/** Maintained pure seed kernel; no simulation rules implemented by WORK-001. */
export function mulberry32(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(next ^ (next >>> 15), next | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, seed: next };
}
