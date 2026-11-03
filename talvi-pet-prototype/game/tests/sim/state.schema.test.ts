import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseSaveValue, SAVE_SCHEMA_VERSION } from '../../src/sim/state.schema';
import { reduce } from '../../src/sim/reduce';
import type { GameState } from '../../src/sim/state';
import { loadContent } from '../../src/content/load';
import { validContent } from '../content/helpers';
import { deepFreeze, giveCopies } from './helpers';

const content = validContent();
const saveV1Text = readFileSync('tests/fixtures/save-v1.json', 'utf8');
const saveV1 = () => JSON.parse(saveV1Text) as { schemaVersion: number; savedAt: string; state: GameState };

it('CONTRACT-PERSIST v1.4 parseSaveValue FX-SAVE-V1 (generated) → { state } deep-equal to the generator state, JSON-plain and dispatchable', () => {
  const loaded = parseSaveValue(content, deepFreeze(saveV1()));
  expect(loaded).toEqual({ state: saveV1().state });
  const { state } = loaded as { state: GameState };
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  expect(reduce(content, state, { type: 'tick', dtMs: 100, move: { x: 0, y: 0 } }).events
    .some(event => event.type === 'action.rejected')).toBe(false);
});

it('CONTRACT-PERSIST v1.5 parseSaveValue schemaVersion 0 or 1 (tier 1) → discarded schemaVersion (checked before the shape)', () => {
  expect(parseSaveValue(content, { ...saveV1(), schemaVersion: 0 })).toEqual({ discarded: 'schemaVersion' });
  expect(parseSaveValue(content, { ...saveV1(), schemaVersion: 1 })).toEqual({ discarded: 'schemaVersion' });
  expect(parseSaveValue(content, { schemaVersion: 3 })).toEqual({ discarded: 'schemaVersion' });
});

it('CONTRACT-PERSIST v1.4 parseSaveValue a string, null, an array or a truncated object → discarded parse', () => {
  expect(parseSaveValue(content, saveV1Text.slice(0, 200))).toEqual({ discarded: 'parse' });
  expect(parseSaveValue(content, null)).toEqual({ discarded: 'parse' });
  expect(parseSaveValue(content, [])).toEqual({ discarded: 'parse' });
  const truncated = saveV1() as { state: Partial<GameState> };
  delete truncated.state.pets;
  expect(parseSaveValue(content, truncated)).toEqual({ discarded: 'parse' });
  const wrongType = saveV1();
  (wrongType.state.avatar as { x: unknown }).x = 'left';
  expect(parseSaveValue(content, wrongType)).toEqual({ discarded: 'parse' });
});

it('CONTRACT-PERSIST v1.5 parseSaveValue a counted type id, placement slot or want id absent from content → discarded unknownContentId', () => {
  const owned = saveV1(); giveCopies(owned.state, ['unicorn-lamp']);
  const slot = saveV1(); slot.state.rooms['dog-room'].placements['floor-99'] = 'lamp';
  const want = saveV1(); want.state.pets.dog.fulfilledWantIds = ['no-such-want']; want.state.pets.dog.hearts = 1;
  const project = saveV1(); project.state.projects['old-house'] = { ...project.state.projects['pet-house'] };
  const heart = saveV1(); heart.state.pets.dog.heartCharms = ['unicorn-lamp'];
  for (const save of [owned, slot, want, project, heart]) expect(parseSaveValue(content, save)).toEqual({ discarded: 'unknownContentId' });
});

it('CONTRACT-PERSIST v1.4 parseSaveValue hearts ≠ fulfilledWantIds.length → discarded invariantViolation', () => {
  const save = saveV1(); save.state.pets.dog.hearts = 2;
  expect(parseSaveValue(content, save)).toEqual({ discarded: 'invariantViolation' });
});

it('CONTRACT-PERSIST v1.4 parseSaveValue an obsolete projects[pet-house].guess (DEC-039) loads with the key dropped, never re-emitted', () => {
  const save = saveV1();
  (save.state.projects['pet-house'] as Record<string, unknown>).guess = 'owl';
  const loaded = parseSaveValue(content, save) as { state: GameState };
  expect(loaded.state).toEqual(saveV1().state);
  expect(Object.keys(loaded.state.projects['pet-house'])).not.toContain('guess');
  expect(JSON.stringify(loaded.state)).not.toContain('guess');
});

it('VERIFY-WORK-036-1-09 greetings and the meeting phase round-trip; a v2 save without greetings loads {}; a bad pair key → unknownContentId; version 2', () => {
  const save = saveV1();
  const owl = save.state.pets.owl;
  const state: GameState = { ...save.state, greetings: { 'dog|owl': { cooldownMs: 1234 } },
    pets: { ...save.state.pets, owl: { ...owl, behaviour: { ...owl.behaviour, phase: 'meeting', target: null, verb: null, reaction: null } } } };
  expect(parseSaveValue(content, { ...save, state })).toEqual({ state });
  const old = saveV1() as { schemaVersion: number; savedAt: string; state: Record<string, unknown> };
  delete old.state.greetings;
  expect((parseSaveValue(content, old) as { state: GameState }).state.greetings).toEqual({});
  for (const key of ['dog|cat', 'cat|dog', 'dog|dog', 'dog', 'dog|owl|dog'])
    expect(parseSaveValue(content, { ...save, state: { ...save.state, greetings: { [key]: { cooldownMs: 0 } } } }), key)
      .toEqual({ discarded: 'unknownContentId' });
  expect(parseSaveValue(content, { ...save, state: { ...save.state, greetings: { 'dog|owl': { cooldownMs: -1 } } } }))
    .toEqual({ discarded: 'parse' });
  expect(SAVE_SCHEMA_VERSION).toBe(2);
});

it('WORK-036-1 A3: a reversed known pair key loads normalised to content order; a key with an unknown id still discards', () => {
  const real = loadContent(); // content pet order dog, owl-mate, owl
  const save = JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8')) as { state: GameState };
  const load = (greetings: GameState['greetings']) => parseSaveValue(real, { ...save, state: { ...save.state, greetings } });
  expect((load({ 'owl|owl-mate': { cooldownMs: 1234 } }) as { state: GameState }).state.greetings)
    .toEqual({ 'owl-mate|owl': { cooldownMs: 1234 } });
  expect((load({ 'owl-mate|owl': { cooldownMs: 1234 } }) as { state: GameState }).state.greetings)
    .toEqual({ 'owl-mate|owl': { cooldownMs: 1234 } });
  expect((load({ 'owl|dog': { cooldownMs: 5 }, 'dog|owl': { cooldownMs: 9 } }) as { state: GameState }).state.greetings)
    .toEqual({ 'dog|owl': { cooldownMs: 9 } });
  for (const key of ['owl|cat', 'cat|owl', 'owl|owl'])
    expect(load({ [key]: { cooldownMs: 0 } }), key).toEqual({ discarded: 'unknownContentId' });
});

