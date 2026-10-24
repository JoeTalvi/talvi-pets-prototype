import { expect, it, vi } from 'vitest';

/** Invariant 4 is a derived quantity no state edit can break, so `starsOf` is made to diverge by a mock. */
vi.mock('../../src/sim/select', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/sim/select')>();
  return { ...actual, starsOf: (...args: Parameters<typeof actual.starsOf>) => {
    const stars = actual.starsOf(...args);
    return { ...stars, points: stars.points + 1 };
  } };
});

it('core §8 invariant 4 violation (starsOf ≠ the recomputed Σ) yields exactly one message naming it', async () => {
  const { checkInvariants } = await import('../../src/sim/invariants');
  const { initialState } = await import('../../src/sim/state');
  const { validContent } = await import('../content/helpers');
  const content = validContent();
  const messages = checkInvariants(content, initialState(content, 1));
  expect(messages.length).toBeGreaterThan(0);
  expect(messages.every(message => message.startsWith('invariant 4: '))).toBe(true);
  expect(messages).toHaveLength(1);
});
