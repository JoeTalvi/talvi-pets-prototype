import { expect, it } from 'vitest';
import type { Door } from '../../src/content/schema/common';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { RuleResult, SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { buildScript, enqueueScript } from '../../src/sim/rules/dialogue';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze, dogRoomDesign, tick } from './helpers';

const advanceAction: Action = { type: 'advanceDialogue' };
const types = (events: SimEvent[]) => events.map(event => event.type);

/** Every dispatch is pure and leaves plain JSON (core §8 invariant 7). */
function step(content: Content, state: GameState, action: Action): RuleResult {
  const result = reduce(content, deepFreeze(state), action);
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  return result;
}

function advanceTimes(content: Content, state: GameState, count: number): RuleResult {
  let result: RuleResult = { state, events: [] };
  for (let index = 0; index < count; index++) {
    const next = step(content, result.state, advanceAction);
    result = { state: next.state, events: [...result.events, ...next.events] };
  }
  return result;
}

/** Ticks straight at the door's centre until the scene changes; returns that tick's result. */
function walkThrough(content: Content, state: GameState, door: Door): RuleResult {
  let current = state;
  for (let index = 0; index < 100; index++) {
    const dx = door.rect.x + door.rect.w / 2 - current.avatar.x, dy = door.rect.y + door.rect.h / 2 - current.avatar.y;
    const divisor = Math.max(Math.hypot(dx, dy), 72);
    const result = step(content, current, tick(dx / divisor, dy / divisor, 100));
    if (result.events.some(event => event.type === 'scene.changed')) return result;
    current = result.state;
  }
  throw new Error(`never reached door ${door.id}`);
}

function orientationClosed() {
  const content = validContent();
  const opened = step(content, initialState(content, 1), tick());
  return { content, state: advanceTimes(content, opened.state, 2).state };
}

function enteredDogRoom() {
  const { content, state } = orientationClosed();
  return { content, entered: walkThrough(content, state, content.street.houses[0].door) };
}

it('VERIFY-MEC-008-001 orientation opens on the first tick, once per save', () => {
  const content = validContent();
  const result = step(content, initialState(content, 1), tick());
  expect(result.events).toEqual([{ type: 'dialogue.opened', script: { source: 'orientation',
    speaker: { game: true }, lines: content.dialogue.orientation, index: 0 } }]);
  expect(content.dialogue.orientation).toHaveLength(2);
  expect(result.state.session.orientationShown).toBe(true);
  const reloaded = { ...JSON.parse(JSON.stringify(result.state)), dialogue: { current: null, queue: [] } };
  expect(types(step(content, reloaded, tick()).events)).not.toContain('dialogue.opened');
});

it('VERIFY-MEC-008-002 linear advance, close, then noDialogue', () => {
  const content = validContent();
  const opened = step(content, initialState(content, 1), tick()).state;
  const first = step(content, opened, advanceAction);
  expect(first.events).toEqual([{ type: 'dialogue.advanced', index: 1 }]);
  const second = step(content, first.state, advanceAction);
  expect(second.events).toEqual([{ type: 'dialogue.closed', source: 'orientation' }]);
  expect(second.state.dialogue.current).toBeNull();
  const third = reduce(content, deepFreeze(second.state), advanceAction);
  expect(third.events).toEqual([{ type: 'action.rejected', action: advanceAction, reason: 'noDialogue' }]);
  expect(third.state).toBe(second.state);
});

it('VERIFY-MEC-008-003 / VERIFY-MEC-009-001 intro and want announce on first entry, never again', () => {
  const { content, entered } = enteredDogRoom();
  const kinds = types(entered.events).filter(type => !type.startsWith('pet.'));
  expect(kinds.slice(kinds.indexOf('scene.changed'))).toEqual(['scene.changed', 'dialogue.opened', 'want.activated']);
  expect(entered.events).toContainEqual({ type: 'dialogue.opened', script: { source: 'intro',
    speaker: { petId: 'dog' }, lines: content.pets.dog.lines.intro, index: 0 } });
  expect(entered.events).toContainEqual({ type: 'want.activated', petId: 'dog', wantId: 'soft-nap', index: 0 });
  expect(entered.state.dialogue.queue).toEqual([{ source: 'wantAnnounce', speaker: { petId: 'dog' },
    lines: ['I have a wish.'], index: 0, wantId: 'soft-nap' }]);
  expect(entered.state.pets.dog.introduced).toBe(true);
  const closed = step(content, entered.state, advanceAction);
  expect(closed.events).toEqual([{ type: 'dialogue.closed', source: 'intro' },
    { type: 'dialogue.opened', script: entered.state.dialogue.queue[0] }]);
  const quiet = advanceTimes(content, closed.state, 1).state;
  const out = walkThrough(content, quiet, content.rooms['dog-room'].doors[0]);
  expect(out.state.scene).toEqual({ kind: 'street' });
  const back = walkThrough(content, out.state, content.street.houses[0].door);
  expect(back.state.scene).toEqual({ kind: 'interior', roomId: 'dog-room' });
  expect(types(back.events)).not.toContain('dialogue.opened');
  expect(types(back.events)).not.toContain('want.activated');
  expect(back.state.dialogue.current).toBeNull();
});

it('VERIFY-MEC-008-004 / VERIFY-MEC-009-002 §6.2 chain order on placing the Dog Bed', () => {
  const { content, state } = dogRoomDesign();
  const result = step(content, state, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
  const kinds = types(result.events);
  expect(kinds.slice(0, kinds.indexOf('want.activated') + 1)).toEqual(['charm.placed', 'stars.changed',
    'want.progressed', 'want.fulfilled', 'items.granted', 'items.granted', 'heart.earned', 'dialogue.opened', 'want.activated']);
  expect(result.events[1]).toMatchObject({ from: 0, to: 4 });
  expect(result.events[2]).toMatchObject({ wantId: 'soft-nap', conditions: [{ met: true }, { met: true }] });
  expect(result.events[3]).toEqual({ type: 'want.fulfilled', petId: 'dog', wantId: 'soft-nap', hearts: 1,
    reward: [{ kind: 'items', items: [{ typeId: 'rug', count: 1 }, { typeId: 'cushion', count: 1 }] }], focusSlotId: 'large-1' });
  expect(result.events[4]).toEqual({ type: 'items.granted', typeId: 'rug', count: 1, source: 'heart' });
  expect(result.events[5]).toEqual({ type: 'items.granted', typeId: 'cushion', count: 1, source: 'heart' });
  expect(result.events[6]).toEqual({ type: 'heart.earned', petId: 'dog', hearts: 1 });
  expect(result.events[7]).toMatchObject({ script: { source: 'vignette', wantId: 'soft-nap' } });
  expect(result.events[8]).toEqual({ type: 'want.activated', petId: 'dog', wantId: 'bright-corner', index: 1 });
  expect(result.state.dialogue.queue.map(script => [script.source, script.wantId]))
    .toEqual([['wantAnnounce', 'bright-corner']]);
  const pet = result.state.pets.dog;
  expect(pet.hearts).toBe(1);
  expect(pet.fulfilledWantIds).toHaveLength(1);
  const rest = advanceTimes(content, result.state, 4);
  expect(rest.events.filter(event => event.type === 'dialogue.opened')).toHaveLength(1);
  expect(rest.state.dialogue).toEqual({ current: null, queue: [] });
});

it('VERIFY-MEC-008-005 a script enqueued while one is open is appended and opens only on close', () => {
  const { content, state } = dogRoomDesign();
  const vignetteOpen = step(content, state, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' }).state;
  const extra = buildScript(content, 'wantAnnounce', { petId: 'dog', wantId: 'feels-like-home' });
  const queued = enqueueScript(deepFreeze(vignetteOpen), extra);
  expect(queued.events).toEqual([]);
  expect(queued.state.dialogue.current).toBe(vignetteOpen.dialogue.current);
  expect(queued.state.dialogue.queue.at(-1)).toEqual(extra);
  const throughVignette = advanceTimes(content, queued.state, 3);
  expect(types(throughVignette.events)).toEqual(['dialogue.advanced', 'dialogue.advanced', 'dialogue.closed', 'dialogue.opened']);
  const last = advanceTimes(content, throughVignette.state, 1);
  expect(last.events).toEqual([{ type: 'dialogue.closed', source: 'wantAnnounce' }, { type: 'dialogue.opened', script: extra }]);
});

it('VERIFY-MEC-008-006 frozen input while a dialogue is open (the tapPet half is in bubbles.test.ts)', () => {
  const { content, state } = dogRoomDesign();
  const open = enqueueScript(state, buildScript(content, 'intro', { petId: 'dog' })).state;
  const play = { ...open, mode: 'play' as const };
  const moved = step(content, play, tick(1, 0, 100));
  expect([moved.state.avatar.x, moved.state.avatar.y]).toEqual([play.avatar.x, play.avatar.y]);
  expect(step(content, play, { type: 'setDesignMode', on: true }).events[0]).toMatchObject({ reason: 'dialogueOpen' });
  expect(step(content, open, { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' }).events[0])
    .toMatchObject({ type: 'action.rejected', reason: 'dialogueOpen' });
});

it('VERIFY-MEC-008-007 design mode persists through the vignette and announce', () => {
  const { content, state } = dogRoomDesign();
  let current = step(content, state, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' }).state;
  expect(current.mode).toBe('design');
  for (let index = 0; index < 4; index++) {
    current = step(content, current, advanceAction).state;
    expect(current.mode).toBe('design');
  }
  expect(current.dialogue.current).toBeNull();
});

it('VERIFY-MEC-008-012 a vignette at index 1 resumes identically after a JSON round trip', () => {
  const { content, state } = dogRoomDesign();
  const placed = step(content, state, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' }).state;
  const atOne = step(content, placed, advanceAction).state;
  expect(atOne.dialogue.current?.index).toBe(1);
  const reloaded = JSON.parse(JSON.stringify(atOne)) as GameState;
  const original = step(content, atOne, advanceAction), restored = step(content, reloaded, advanceAction);
  expect(restored.events).toEqual(original.events);
  expect(restored.events).toEqual([{ type: 'dialogue.advanced', index: 2 }]);
  expect(restored.state).toEqual(original.state);
});
