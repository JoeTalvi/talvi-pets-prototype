import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { buildScript, enqueueScript } from '../../src/sim/rules/dialogue';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { advance, tick } from './helpers';

const content = validContent();
const roundups = (events: SimEvent[]) => events.filter(event => event.type === 'roundup.fired');

function drain(state: GameState): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  while (state.dialogue.current !== null) {
    const result = reduce(content, state, { type: 'advanceDialogue' });
    state = result.state; events.push(...result.events);
  }
  return { state, events };
}

/** Ticks while asserting the feed banks nothing and fires nothing as long as a dialogue is open. */
function tickWhileOpen(state: GameState, ms: number, step: number): GameState {
  const before = state.feed.sinceLastEventMs;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    const result = reduce(content, state, tick(0, 0, step));
    expect(result.state.dialogue.current).not.toBeNull();
    expect(roundups(result.events)).toEqual([]);
    expect(result.state.feed.sinceLastEventMs).toBe(before);
    state = result.state;
  }
  return state;
}

function firstRoundupAfter(state: GameState, step: number): number {
  for (let elapsed = step; elapsed <= 10 * state.session.eventIntervalMs!; elapsed += step) {
    const result = reduce(content, state, tick(0, 0, step));
    if (roundups(result.events).length) return elapsed;
    state = result.state;
  }
  throw new Error('no round-up fired');
}

describe('WORK-032-1 fix 1: round-ups wait for every dialogue (MEC-002 feed pause)', () => {
  it('VERIFY-WORK-032-1-02 the first (100 ms, the reducer maximum) tick of a fresh save banks nothing before the orientation', () => {
    const result = reduce(content, initialState(content, 7), tick(0, 0, 100));
    expect(result.state.feed.sinceLastEventMs).toBe(0);
    expect(roundups(result.events)).toEqual([]);
    expect(result.state.dialogue.current?.source).toBe('orientation');
  });

  it('VERIFY-WORK-032-1-01 orientation open 60 s banks nothing; first round-up exactly one interval after it closes', () => {
    let state = initialState(content, 7);
    state.session.eventIntervalMs = 250;
    state = reduce(content, state, tick(0, 0, 0)).state;
    state = tickWhileOpen(state, 60_000, 100);
    state = drain(state).state;
    expect(state.feed.sinceLastEventMs).toBe(0);
    expect(firstRoundupAfter(state, 50)).toBe(250);
  });

  it('VERIFY-WORK-032-1-01 a mid-session vignette pauses the feed and resumes from the banked time', () => {
    let state = initialState(content, 7);
    state.session.eventIntervalMs = 250;
    state = drain(reduce(content, state, tick(0, 0, 0)).state).state;
    state = advance(reduce, content, state, 100, 100).state;
    expect(state.feed.sinceLastEventMs).toBe(100);
    state = enqueueScript(state, buildScript(content, 'vignette', { petId: 'dog', wantId: content.pets.dog.wants[0].id })).state;
    state = tickWhileOpen(state, 60_000, 100);
    state = drain(state).state;
    expect(firstRoundupAfter(state, 50)).toBe(150);
  });

  it('VERIFY-MEC-002-006 kept: a frozen interval banks nothing with no dialogue open', () => {
    let state = drain(reduce(content, initialState(content, 7), tick(0, 0, 0)).state).state;
    state.session.eventIntervalMs = null;
    const result = advance(reduce, content, state, 60_000);
    expect(result.state.feed.sinceLastEventMs).toBe(0);
    expect(roundups(result.events)).toEqual([]);
  });
});
