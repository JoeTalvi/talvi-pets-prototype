import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState, type PetBehaviour } from '../../src/sim/state';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { loadContent } from '../../src/content/load';
import { advance, deepFreeze, designIn, dogLikesLight, eventsOf, tick } from './helpers';

const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });
const remove = (slotId: string): Action => ({ type: 'removeCharm', slotId });
const step = (content: Content, state: GameState, action: Action) => {
  const result = reduce(content, deepFreeze(state), action);
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  return result;
};
const withDog = (state: GameState, patch: Partial<PetBehaviour>): GameState => ({ ...state, pets: { ...state.pets,
  dog: { ...state.pets.dog, behaviour: { ...state.pets.dog.behaviour, ...patch } } } });
const usingBed = (content: Content) => {
  const state = designIn(content, ['soft-nap']);
  state.rooms['dog-room'].placements = { 'large-1': 'dog-bed' };
  return withDog(state, { phase: 'using', x: 1250, y: 600, timerMs: 8000, target: { slotId: 'large-1' }, verb: 'nap' });
};

it('VERIFY-MEC-007-001 idle Dog walks 48 px per 100 ms tick to the bed anchor and naps', () => {
  const content = validContent();
  let state = designIn(content);
  state.rooms['dog-room'].placements = { 'large-1': 'dog-bed' };
  const events: SimEvent[] = [];
  const walked: number[] = [];
  for (let index = 0; index < 200 && eventsOf(events, 'pet.verbStarted').length === 0; index++) {
    const before = state.pets.dog.behaviour;
    const result = step(content, state, tick(0, 0, 100));
    const after = result.state.pets.dog.behaviour;
    if (before.phase === 'walking' && after.phase === 'walking') walked.push(Math.hypot(after.x - before.x, after.y - before.y));
    events.push(...result.events); state = result.state;
  }
  expect(eventsOf(events, 'pet.phaseChanged')[0]).toMatchObject({ from: 'idle', to: 'walking', target: { slotId: 'large-1' }, verb: 'nap' });
  expect(walked.length).toBeGreaterThan(5);
  for (const distance of walked) expect(distance).toBeCloseTo(48, 6);
  expect(eventsOf(events, 'pet.verbStarted')).toEqual([{ type: 'pet.verbStarted', petId: 'dog', verb: 'nap', slotId: 'large-1' }]);
  const dog = state.pets.dog.behaviour;
  expect([dog.phase, dog.x, dog.y, dog.facing]).toEqual(['using', 1250, 600, 'left']);
  expect(dog.timerMs).toBeGreaterThanOrEqual(6000);
  expect(dog.timerMs).toBeLessThanOrEqual(12000);
});

/** One idle decision per dispatch (behaviour reset to idle with timerMs 0, rngState carried). */
function decisions(content: Content, state: GameState, count: number): string[] {
  let current = state;
  const chosen: string[] = [];
  for (let index = 0; index < count; index++) {
    current = withDog(current, { phase: 'idle', x: 800, y: 700, timerMs: 0, target: null, verb: null, reaction: null });
    const result = reduce(content, current, tick(0, 0, 100));
    const target = eventsOf(result.events, 'pet.phaseChanged')[0].target!;
    chosen.push('slotId' in target ? target.slotId : target.wanderPointId);
    current = result.state;
  }
  return chosen;
}

it('VERIFY-MEC-007-002 weights 3 vs 1 (fork-1 variant: rug soft 3 vs lamp light 1): heavier slot 70–80 % of 1,000 decisions, reproducible', () => {
  const content = dogLikesLight();
  const state = designIn(content, ['soft-nap']);
  state.rooms['dog-room'].placements = { 'floor-1': 'rug', 'floor-2': 'lamp' };
  const first = decisions(content, state, 1000);
  const share = first.filter(slot => slot === 'floor-1').length / 1000;
  expect(share).toBeGreaterThanOrEqual(0.7);
  expect(share).toBeLessThanOrEqual(0.8);
  expect(decisions(content, state, 1000)).toEqual(first);
});

it('VERIFY-MEC-007-003 recent-target penalty: the recent equal-weight slot is chosen 20–26 % of 1,000 decisions', () => {
  const content = validContent();
  const state = designIn(content, ['soft-nap']);
  state.rooms['dog-room'].placements = { 'floor-1': 'rug', 'floor-2': 'rug' };
  state.pets.dog.recentTargets = ['floor-1'];
  const recent = decisions(content, state, 1000).filter(slot => slot === 'floor-1').length;
  expect(recent / 1000).toBeGreaterThanOrEqual(0.2);
  expect(recent / 1000).toBeLessThanOrEqual(0.26);
});

it('VERIFY-MEC-007-004 only plant charms: wander targets only, no pet.verbStarted; never the same wander point twice in a row (fork #36 resolved 2026-10-26)', () => {
  const content = validContent();
  const state = designIn(content, ['soft-nap']);
  state.inventory.ownedTypeIds.push('fern');
  state.rooms['dog-room'].placements = { 'floor-1': 'fern', 'floor-3': 'fern', 'floor-5': 'fern' };
  const { events } = advance(reduce, content, state, 1_200_000);
  const targets = eventsOf(events, 'pet.phaseChanged').filter(event => event.to === 'walking').map(event => event.target);
  expect(targets.length).toBeGreaterThan(100);
  const ids = targets.map(target => (target as { wanderPointId: string }).wanderPointId);
  expect(new Set(ids)).toEqual(new Set(['w0', 'w1', 'w2']));
  const repeats = ids.slice(1).filter((id, index) => id === ids[index]).length;
  expect(repeats).toBe(0);
  expect(eventsOf(events, 'pet.verbStarted')).toEqual([]);
});

it('VERIFY-MEC-007-008 walk-over overrides using (fork-1 variant: lamp liked); arrival ≤ 5,000 ms for every anchor pair', () => {
  const content = dogLikesLight();
  const result = step(content, usingBed(content), place('floor-1', 'lamp'));
  expect(result.events.filter(event => event.type.startsWith('pet.'))).toEqual([
    { type: 'pet.verbEnded', petId: 'dog', verb: 'nap', slotId: 'large-1' },
    { type: 'pet.reacted', petId: 'dog', reaction: 'like', slotId: 'floor-1', typeId: 'lamp', line: null, walkOver: true },
    { type: 'pet.phaseChanged', petId: 'dog', from: 'using', to: 'walking', target: { slotId: 'floor-1' }, verb: 'look-at', reaction: 'like' }]);
  const slots = content.rooms['dog-room'].slots;
  const base = designIn(content, ['soft-nap']);
  base.rooms['dog-room'].placements = Object.fromEntries(slots.map(slot => [slot.id, slot.sizeClass === 'wall' ? 'painting' : slot.sizeClass === 'large' ? 'dog-bed' : 'lamp']));
  for (const from of slots) for (const to of slots) {
    let state = withDog(base, { phase: 'walking', x: from.anchor.x, y: from.anchor.y, target: { slotId: to.id }, verb: null, reaction: 'like' });
    let elapsed = 0;
    while (state.pets.dog.behaviour.phase === 'walking' && elapsed <= 5000) {
      state = reduce(content, state, tick(0, 0, 100)).state; elapsed += 100;
    }
    expect(elapsed).toBeLessThanOrEqual(5000);
  }
});

it('VERIFY-MEC-007-009 removing the used bed: interruptedPetId dog, pet.verbEnded, pet.reacted interrupted, reacting then idle after 2,000 ms', () => {
  const content = validContent();
  const result = step(content, usingBed(content), remove('large-1'));
  expect(result.events[0]).toMatchObject({ type: 'charm.removed', interruptedPetId: 'dog' });
  expect(result.events.filter(event => event.type.startsWith('pet.'))).toEqual([
    { type: 'pet.verbEnded', petId: 'dog', verb: 'nap', slotId: 'large-1' },
    { type: 'pet.reacted', petId: 'dog', reaction: 'interrupted', slotId: 'large-1', typeId: 'dog-bed', line: null, walkOver: false },
    { type: 'pet.phaseChanged', petId: 'dog', from: 'using', to: 'reacting', target: { slotId: 'large-1' }, verb: null, reaction: 'interrupted' }]);
  const almost = advance(reduce, content, result.state, 1900);
  expect(almost.state.pets.dog.behaviour.phase).toBe('reacting');
  const later = advance(reduce, content, almost.state, 100);
  expect(eventsOf(later.events, 'pet.phaseChanged')).toMatchObject([{ from: 'reacting', to: 'idle' }]);
});

it('VERIFY-MEC-007-010 removing the bed the Dog walks to: idle, no pet.reacted, interruptedPetId null', () => {
  const content = validContent();
  const walking = withDog(usingBed(content), { phase: 'walking', x: 800, y: 700, timerMs: 0, verb: 'nap' });
  const result = step(content, walking, remove('large-1'));
  expect(result.events[0]).toMatchObject({ type: 'charm.removed', interruptedPetId: null });
  expect(eventsOf(result.events, 'pet.reacted')).toEqual([]);
  expect(result.state.pets.dog.behaviour).toMatchObject({ phase: 'idle', target: null, verb: null, reaction: null });
});

it('VERIFY-MEC-007-011 greeting on entry: scene.changed, pet.reacted greeting, walk to w0 (nearest the spawn), greeting, idle after 2,000 ms', () => {
  const content = validContent();
  const state = initialState(content, 1);
  state.session.orientationShown = true;
  state.avatar = { ...state.avatar, x: 480, y: 820 };
  const entered = step(content, state, tick(0, 0, 100));
  const kinds = entered.events.map(event => event.type);
  expect(kinds.slice(0, 3)).toEqual(['scene.changed', 'pet.reacted', 'pet.phaseChanged']);
  const greeting = eventsOf(entered.events, 'pet.reacted')[0];
  expect(greeting).toMatchObject({ reaction: 'greeting', slotId: null, typeId: null, walkOver: true });
  expect(content.pets.dog.lines.greeting).toContain(greeting.line);
  expect(eventsOf(entered.events, 'pet.phaseChanged')[0]).toMatchObject({ to: 'walking', target: { wanderPointId: 'w0' }, reaction: 'greeting' });
  const walked = advance(reduce, content, entered.state, 3000);
  const phases = eventsOf(walked.events, 'pet.phaseChanged');
  expect(phases[0]).toMatchObject({ from: 'walking', to: 'greeting' });
  const arrivedAt = walked.events.indexOf(phases[0]);
  expect(arrivedAt).toBeGreaterThanOrEqual(0);
  const greeted = advance(reduce, content, walked.state, 2000);
  expect(eventsOf([...walked.events, ...greeted.events], 'pet.phaseChanged').map(event => event.to)).toContain('idle');
});

it('VERIFY-MEC-007-013 only the resident is simulated: 10 s in the owl-room leaves the Dog untouched; the Owl moves', () => {
  const content = validContent();
  const state = designIn(content);
  state.scene = { kind: 'interior', roomId: 'owl-room' };
  state.mode = 'play';
  state.pets.owl.introduced = true;
  const dog = structuredClone(state.pets.dog);
  const { state: after } = advance(reduce, content, deepFreeze(state), 10_000);
  expect(after.pets.dog).toEqual(dog);
  expect([after.pets.owl.behaviour.x, after.pets.owl.behaviour.y]).not.toEqual([state.pets.owl.behaviour.x, state.pets.owl.behaviour.y]);
});

/** 2,000 ticks with placements at fixed ticks; returns the final state, every event and the decisions. */
function scripted(content: Content, seed: number) {
  const plan: Record<number, Action> = { 50: place('floor-1', 'lamp'), 400: place('floor-3', 'rug'),
    900: place('wall-1', 'painting'), 1300: remove('floor-1'), 1600: place('floor-5', 'stool') };
  let state = designIn(content, [], seed);
  state.inventory.ownedTypeIds.push('rug');
  const events: SimEvent[] = [];
  for (let index = 0; index < 2000; index++) {
    const result = reduce(content, state, plan[index] ?? tick(0, 0, 100));
    state = result.state; events.push(...result.events);
  }
  const decisions = eventsOf(events, 'pet.phaseChanged').filter(event => event.to === 'walking').map(event => event.target);
  return { state, events, decisions };
}

it('VERIFY-MEC-007-014 partial (bounded; CORE-008 finishes in WORK-003-5): two reducers, seed 1, identical states and events; seed 2 decides differently', () => {
  const content = validContent();
  const first = scripted(content, 1);
  expect(scripted(content, 1)).toEqual(first);
  expect(first.decisions.length).toBeGreaterThan(5);
  expect(eventsOf(first.events, 'pet.verbStarted').length).toBeGreaterThan(0);
  expect(scripted(content, 2).decisions).not.toEqual(first.decisions);
});

it('play-session Q6: with greetingDelayMs the greeting walk starts after the door fade-in, not on the entry tick', () => {
  const content = loadContent(manifest, patchFiles(files(), [{ file: 'tuning.json', path: '/greetingDelayMs', value: 520 }]));
  const state = initialState(content, 1);
  state.session.orientationShown = true;
  state.avatar = { ...state.avatar, x: 480, y: 820 };
  const entered = step(content, state, tick(0, 0, 100));
  expect(eventsOf(entered.events, 'pet.reacted')).toEqual([]);
  expect(entered.state.pets.dog.behaviour).toMatchObject({ phase: 'idle', reaction: 'greeting' });
  const early = advance(reduce, content, entered.state, 400);
  expect(eventsOf(early.events, 'pet.reacted')).toEqual([]);
  const later = advance(reduce, content, early.state, 200);
  expect(eventsOf(later.events, 'pet.reacted')[0]).toMatchObject({ reaction: 'greeting', walkOver: true });
  expect(eventsOf(later.events, 'pet.phaseChanged').at(-1)).toMatchObject({ to: 'walking', target: { wanderPointId: 'w0' }, reaction: 'greeting' });
});
