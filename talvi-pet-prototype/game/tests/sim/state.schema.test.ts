import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseSaveValue } from '../../src/sim/state.schema';
import { reduce } from '../../src/sim/reduce';
import type { GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze } from './helpers';

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

it('CONTRACT-PERSIST v1.4 parseSaveValue schemaVersion 0 → discarded schemaVersion (checked before the shape)', () => {
  expect(parseSaveValue(content, { ...saveV1(), schemaVersion: 0 })).toEqual({ discarded: 'schemaVersion' });
  expect(parseSaveValue(content, { schemaVersion: 2 })).toEqual({ discarded: 'schemaVersion' });
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

it('CONTRACT-PERSIST v1.4 parseSaveValue an owned type id, placement slot or want id absent from content → discarded unknownContentId', () => {
  const owned = saveV1(); owned.state.inventory.ownedTypeIds.push('unicorn-lamp');
  const slot = saveV1(); slot.state.rooms['dog-room'].placements['floor-99'] = 'lamp';
  const want = saveV1(); want.state.pets.dog.fulfilledWantIds = ['no-such-want']; want.state.pets.dog.hearts = 1;
  const project = saveV1(); project.state.projects['old-house'] = { ...project.state.projects['pet-house'] };
  for (const save of [owned, slot, want, project]) expect(parseSaveValue(content, save)).toEqual({ discarded: 'unknownContentId' });
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
