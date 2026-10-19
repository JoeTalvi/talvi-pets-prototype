/** Pure mulberry32 step. The returned seed is the persisted unsigned cursor. */
export function mulberry32(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(next ^ (next >>> 15), next | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, seed: next };
}

/** Independent pet stream, in content order (CONTRACT-STATE v1.4 §1). */
export function petSeed(seed: number, petIndex: number): number {
  return (seed ^ Math.imul(0x9e3779b9, petIndex + 1)) >>> 0;
}
