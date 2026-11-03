/**
 * DEC-049 ladder rule 5 (tiers.md): under `prefers-reduced-motion: reduce` the hitstop, flash and shake are dropped (moments
 * keep their order and sound). jsdom and old browsers without `matchMedia` read as "no preference".
 */
export function reducedMotion(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
