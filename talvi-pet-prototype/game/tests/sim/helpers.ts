import { expect } from 'vitest';
import type { Content } from '../../src/content/types';
import { RoomSchema } from '../../src/content/schema/room';
import type { Action, TickAction } from '../../src/sim/actions';
import type { RuleResult, SimEvent } from '../../src/sim/events';
import { initialState, type GameState } from '../../src/sim/state';
import { reduce } from '../../src/sim/reduce';
import { loadContent } from '../../src/content/load';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentFiles } from '../../src/content/load';
import square from '../fixtures/room-square.json';

/** FX-ROOM-SQUARE; orientation and the Dog intro are marked done so MEC-001 rows are not frozen
 * by the scripts that later lanes add (convention 6). */
export function squareFixture(seed = 1) {
  const content = validContent();
  content.rooms['dog-room'] = RoomSchema.parse(square);
  const state = initialState(content, seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.avatar = { x: 500, y: 400, facing: 'down', immunityMs: 0, facingCandidate: null, outfitId: 'default' };
  state.session.orientationShown = true;
  state.pets.dog.introduced = true;
  return { content, state };
}

/** FX-CONTENT-MIN in `dog-room`, scripts done, design mode entered through `setDesignMode`. */
export function dogRoomDesign(seed = 1) {
  const content = validContent();
  const state = initialState(content, seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.session.orientationShown = true;
  state.pets.dog.introduced = true;
  return { content, state: reduce(content, state, { type: 'setDesignMode', on: true }).state };
}

export function tick(x = 0, y = 0, dtMs = 16): TickAction {
  return { type: 'tick', dtMs, move: { x, y } };
}

/** Verification §5: run ticks of `step` ms (the last one shorter) and collect every event. */
export function advance(reduceFn: (content: Content, state: GameState, action: Action) => RuleResult,
  content: Content, state: GameState, ms: number, step = 100): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let current = state;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    const result = reduceFn(content, current, tick(0, 0, Math.min(step, ms - elapsed)));
    current = result.state; events.push(...result.events);
  }
  return { state: current, events };
}

/** Test inputs may be frozen recursively to prove pure rules never mutate them. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Fork-1 in-test variant of FX-CONTENT-MIN: the Dog also likes `light` (weight 1), as design §7
 * and the real Dog do (CONTENT v1.4 allows 2–4 likes); the fixture directory is untouched. */
export function dogLikesLight(): Content {
  const dog = validContent().pets.dog;
  return loadContent(manifest, patchFiles(files(), [
    { file: 'pets/dog.json', path: '/likes', value: [...dog.likes, { tag: 'light', weight: 1 }] },
  ]));
}

/** `dogRoomDesign` on another content, with the Dog's first want already fulfilled (want 2 active). */
export function designIn(content: Content, fulfilled: string[] = [], seed = 1): GameState {
  const state = initialState(content, seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.mode = 'design';
  state.session.orientationShown = true;
  state.pets.dog.introduced = true;
  state.pets.dog.fulfilledWantIds = [...fulfilled];
  state.pets.dog.hearts = fulfilled.length;
  return state;
}

export const eventsOf = <T extends SimEvent['type']>(events: readonly SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type);

/** FX-CONTENT-MIN on the street with orientation done; Pet House at `ack` / `cents` (cents via debugSetCurrent). */
export function owing(content: Content, ack: number, cents: number): GameState {
  const state = initialState(content, 1);
  state.session.orientationShown = true;
  state.projects['pet-house'].acknowledgedPhase = ack as GameState['projects'][string]['acknowledgedPhase'];
  return reduce(content, state, { type: 'debugSetCurrent', projectId: 'pet-house', cents }).state;
}

/** Dispatch each action on frozen inputs, asserting JSON-plainness; returns every result. */
export function run(content: Content, state: GameState, actions: Action[]): { state: GameState; results: RuleResult[] } {
  const results: RuleResult[] = [];
  let current = state;
  for (const action of actions) {
    const result = reduce(deepFreeze(content), deepFreeze(current), action);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    results.push(result); current = result.state;
  }
  return { state: current, results };
}

export const act = (type: 'cutsceneFinished' | 'collectRewards' | 'skipWait' | 'closeReveal' | 'arrivalFinished') =>
  ({ type }) as Action;
export const ack: Action = { type: 'acknowledgeProject', projectId: 'pet-house' };

/** WORK-032-1 fix 1: the feed banks nothing until the orientation is shown and closed; feed-mechanics rows start
 * from a state whose orientation is already done so they measure the clock, not the opening. */
export function orientationDone(state: GameState): GameState {
  return { ...state, session: { ...state.session, orientationShown: true } };
}

/** DEC-043 test setup (convention 6 direct edit): `count` more copies in hand of each id; a new id's key is
 * appended (first-grant order). */
export function giveCopies(state: GameState, ids: readonly string[], count = 1): void {
  for (const id of ids) state.inventory.counts[id] = (state.inventory.counts[id] ?? 0) + count;
}

/** Every content type in file order with `count` copies in hand (replaces the tier 1 "own everything" edit). */
export const allCopies = (content: Content, count = 9): Record<string, number> =>
  Object.fromEntries(content.charms.types.map(type => [type.id, count]));

/** FX-REAL: every `src/content/**\/*.json`, read with node:fs, loaded without a manifest. */
export function realContent() {
  const root = 'src/content', data: ContentFiles = {};
  for (const name of readdirSync(root).filter(file => file.endsWith('.json')))
    data[name] = JSON.parse(readFileSync(join(root, name), 'utf8'));
  for (const dir of ['rooms', 'pets'])
    for (const name of readdirSync(join(root, dir)).filter(file => file.endsWith('.json')))
      data[`${dir}/${name}`] = JSON.parse(readFileSync(join(root, dir, name), 'utf8'));
  return loadContent(undefined, data);
}

