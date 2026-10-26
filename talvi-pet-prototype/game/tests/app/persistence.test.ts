import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistence, loadSave, parseSave, STORAGE_KEYS } from '../../src/app/persistence';
import { createStore } from '../../src/app/store';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { checkInvariants } from '../../src/sim/invariants';
import { hiddenTagOf } from '../../src/sim/rules/wants';
import { chooserTypes } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { GameStateSchema, parseSaveValue } from '../../src/sim/state.schema';
import { validContent } from '../content/helpers';
import { dogRoomDesign, squareFixture } from '../sim/helpers';
import { fixtureText, testLog } from './helpers';

const SEED = 1;
/** Set by the lane's evidence run to record the measured save size; unset in ordinary runs. */
const EVIDENCE = process.env.TPP_EVIDENCE_DIR;

function boot(content: Content, saveText: string | null) {
  const { log, storage } = testLog(content);
  if (saveText !== null) storage.setItem(STORAGE_KEYS.save, saveText);
  const loaded = loadSave(content, storage, log, SEED);
  const persistence = createPersistence({ storage, log, debounceMs: content.tuning.saveDebounceMs });
  return { log, storage, loaded, persistence };
}
const linesOf = (log: ReturnType<typeof testLog>['log'], type: string) => log.lines().filter(line => line.type === type);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('tools §6 parseSave', () => {
  it('tools §6 parseSave: invalid JSON → parse; save-v1 text → the state parseSaveValue returns', () => {
    const content = validContent();
    const text = fixtureText('save-v1.json');
    expect(parseSave(content, '{not json')).toEqual({ discarded: 'parse' });
    expect(parseSave(content, text)).toEqual(parseSaveValue(content, JSON.parse(text)));
    expect('state' in parseSave(content, text)).toBe(true);
  });
});

describe('VERIFY-CORE-012 CONTRACT-PERSIST', () => {
  it('VERIFY-CORE-012 (a) save-v1 loads, one changing dispatch is written after the debounce and reloads equal', () => {
    const content = validContent();
    const text = fixtureText('save-v1.json');
    const { log, storage, loaded, persistence } = boot(content, text);
    expect(loaded.source).toBe('save');
    expect(loaded.state).toEqual((parseSaveValue(content, JSON.parse(text)) as { state: GameState }).state);
    const store = createStore(content, loaded.state);
    persistence.attach(store);
    store.dispatch({ type: 'debugSetTesterLabel', text: 'core-012' });
    expect(storage.getItem(STORAGE_KEYS.save)).toBe(text);
    vi.advanceTimersByTime(content.tuning.saveDebounceMs);
    const written = storage.getItem(STORAGE_KEYS.save)!;
    const saved = JSON.parse(written);
    expect(Object.keys(saved)).toEqual(['schemaVersion', 'savedAt', 'state']);
    expect(saved.schemaVersion).toBe(1);
    expect(saved.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(loadSave(content, storage, log, SEED).state).toEqual(store.getState());
    // Play-session Q18 (2026-10-26): routine writes are no longer logged; failures still are (log.quota).
    expect(linesOf(log, 'save.written')).toEqual([]);
  });

  it('VERIFY-CORE-012 (a) changes inside the debounce collapse into one write; flush() writes at once', () => {
    const content = validContent();
    const { storage, loaded, persistence } = boot(content, null);
    const writes = vi.spyOn(storage, 'setItem');
    const store = createStore(content, loaded.state);
    persistence.attach(store);
    store.dispatch({ type: 'debugSetTesterLabel', text: 'a' });
    store.dispatch({ type: 'debugSetTesterLabel', text: 'b' });
    persistence.flush();
    vi.advanceTimersByTime(content.tuning.saveDebounceMs * 2);
    expect(writes.mock.calls.filter(([key]) => key === STORAGE_KEYS.save)).toHaveLength(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.save)!).state.session.testerLabel).toBe('b');
  });

  it('foundation §4.4 debounce is bounded: ticks every 16 ms for 2 s still write tpp.save during play (review WORK-014-3-1 A-1)', () => {
    const content = validContent();
    const { storage, loaded, persistence } = boot(content, null);
    const writes = vi.spyOn(storage, 'setItem');
    const saves = () => writes.mock.calls.filter(([key]) => key === STORAGE_KEYS.save).length;
    const store = createStore(content, loaded.state);
    persistence.attach(store);
    for (let elapsed = 0; elapsed < 2000; elapsed += 16) {
      store.dispatch({ type: 'tick', dtMs: 16, move: { x: 0, y: 0 } });
      vi.advanceTimersByTime(16);
    }
    expect(saves()).toBeGreaterThanOrEqual(1);
    expect(storage.getItem(STORAGE_KEYS.save)).not.toBeNull();
    expect(saves()).toBeLessThanOrEqual(Math.ceil(2000 / content.tuning.saveDebounceMs));
  });

});

describe('VERIFY-CORE-012 FX-SAVE-BAD and size budget', () => {
  it.each([
    ['schema-0', 'schemaVersion'], ['parse-error', 'parse'],
    ['unknown-id', 'unknownContentId'], ['invariant', 'invariantViolation'],
  ])('VERIFY-CORE-012 (b) FX-SAVE-BAD %s → fresh state and one save.discarded {reason: %s}', (name, reason) => {
    const content = validContent();
    const { log, loaded } = boot(content, fixtureText(`save-bad/${name}.json`));
    expect(loaded).toEqual({ state: initialState(content, SEED), source: 'fresh', reason });
    expect(linesOf(log, 'save.discarded').map(({ type, reason }) => ({ type, reason })))
      .toEqual([{ type: 'save.discarded', reason }]);
  });

  it('VERIFY-CORE-012 (b) an absent tpp.save → fresh with no save.discarded', () => {
    const content = validContent();
    const { log, loaded } = boot(content, null);
    expect(loaded).toEqual({ state: initialState(content, SEED), source: 'fresh' });
    expect(linesOf(log, 'save.discarded')).toEqual([]);
  });

  it('VERIFY-CORE-012 (c) a full-progress state serialises under 64 KB', async () => {
    const content = validContent();
    const state = fullProgress(content);
    expect(GameStateSchema.safeParse(state).success).toBe(true);
    expect(checkInvariants(content, state)).toEqual([]);
    const { storage, persistence } = boot(content, null);
    persistence.changed(state);
    persistence.flush();
    const bytes = new TextEncoder().encode(storage.getItem(STORAGE_KEYS.save)!).length;
    expect(bytes).toBeLessThan(65536);
    if (!EVIDENCE) return;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${EVIDENCE}/save-bytes.txt`, `VERIFY-CORE-012 (c) full-progress tpp.save over FX-CONTENT-MIN: ${bytes} bytes (budget 65536)\n`);
  });
});

/** Full progress: dog-room filled through the store; owl placements and pet progress set directly (tools §2.4). */
function fullProgress(content: Content): GameState {
  const { state } = dogRoomDesign();
  const store = createStore(content, state);
  store.dispatch({ type: 'debugUnlockAllTypes' });
  for (const slot of content.rooms['dog-room'].slots) {
    drain(store);
    const type = chooserTypes(content, store.getState(), slot.id)[0];
    store.dispatch({ type: 'placeCharm', slotId: slot.id, typeId: type.id });
  }
  drain(store);
  const full = structuredClone(store.getState());
  expect(Object.keys(full.rooms['dog-room'].placements)).toHaveLength(content.rooms['dog-room'].slots.length);
  for (const slot of content.rooms['owl-room'].slots)
    full.rooms['owl-room'].placements[slot.id] = content.charms.types.find(type => type.sizeClass === slot.sizeClass)!.id;
  for (const pet of Object.values(content.pets)) {
    const progress = full.pets[pet.id];
    progress.fulfilledWantIds = pet.wants.map(want => want.id);
    progress.hearts = pet.wants.length;
    progress.revealedHiddenTags = Object.fromEntries(pet.wants.flatMap(want => {
      const tag = hiddenTagOf(want);
      return tag ? [[want.id, [tag]]] : [];
    }));
  }
  return full;
}

function drain(store: ReturnType<typeof createStore>) {
  while (store.getState().dialogue.current) store.dispatch({ type: 'advanceDialogue' });
}

describe('VERIFY-MEC-001-012 R7 persistence', () => {
  it('VERIFY-MEC-001-012 after the 007 door entry, flush → load keeps scene, avatar (immunity 500) and mode', () => {
    const { content, state } = squareFixture();
    state.avatar.y = 130;
    const { log, storage, persistence } = boot(content, null);
    const store = createStore(content, state);
    persistence.attach(store);
    store.dispatch({ type: 'tick', dtMs: 16, move: { x: 0, y: -1 } });
    expect(store.getState().scene).toEqual({ kind: 'street' });
    expect(store.getState().avatar.immunityMs).toBe(500);
    persistence.flush();
    const loaded = loadSave(content, storage, log, SEED);
    expect(loaded.source).toBe('save');
    const { scene, avatar, mode } = store.getState();
    expect({ scene: loaded.state.scene, avatar: loaded.state.avatar, mode: loaded.state.mode }).toEqual({ scene, avatar, mode });
    expect(JSON.parse(JSON.stringify(loaded.state))).toEqual(loaded.state);
  });
});

describe('VERIFY-MEC-004-011 unknown id', () => {
  it('VERIFY-MEC-004-011 FX-SAVE-BAD unknown-id → save.discarded {unknownContentId} once; state fresh', () => {
    const content = validContent();
    const { log, loaded } = boot(content, fixtureText('save-bad/unknown-id.json'));
    expect(loaded.state).toEqual(initialState(content, SEED));
    expect(linesOf(log, 'save.discarded')).toEqual([expect.objectContaining({ reason: 'unknownContentId' })]);
  });
});

describe('VERIFY-MEC-003-005 obsolete guess key (DEC-039)', () => {
  it('VERIFY-MEC-003-005 DEC-039: an old projects[pet-house].guess is dropped on load, project data kept, nothing guess-shaped emitted', () => {
    const content = validContent();
    const legacy = JSON.parse(fixtureText('save-v1.json'));
    const project = structuredClone(legacy.state.projects['pet-house']);
    legacy.state.projects['pet-house'].guess = 'owl';
    const { log, loaded } = boot(content, JSON.stringify(legacy));
    expect(loaded.source).toBe('save');
    expect(loaded.state.projects['pet-house']).toEqual(project);
    expect(linesOf(log, 'save.discarded')).toEqual([]);
    const store = createStore(content, loaded.state);
    log.attach(store);
    store.start();
    store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1300 });
    expect(JSON.stringify(store.getState())).not.toContain('guess');
    expect(log.lines().map(line => JSON.stringify(line)).join('\n')).not.toContain('guess');
  });
});

describe('VERIFY-MEC-002-021 replay on load', () => {
  const replay = (unlockedTypeIds: string[]): SimEvent => ({ type: 'celebration.started', projectId: 'pet-house',
    fromPhase: 1, toPhase: 4, completes: false, unlockedTypeIds, clueIndices: [1, 2, 3], replay: true });

  it.each([
    ['cutscene', { type: 'collectRewards' }], ['milestone', { type: 'cutsceneFinished' }], ['reveal', { type: 'collectRewards' }],
  ] as [string, Action][])('VERIFY-MEC-002-021 save-v1.%s: start() replays celebration.started once; %o is wrongStep', (step, passed) => {
    const content = validContent();
    const saved = JSON.parse(fixtureText(`save-v1.${step}.json`));
    const { loaded } = boot(content, JSON.stringify(saved));
    const store = createStore(content, loaded.state);
    const seen: SimEvent[] = [];
    store.subscribeAll(event => seen.push(event));
    store.start();
    expect(seen).toEqual([replay(saved.state.celebration.unlockedTypeIds)]);
    const owned = store.getState().inventory.ownedTypeIds;
    store.dispatch(passed);
    expect(seen.slice(1)).toEqual([expect.objectContaining({ type: 'action.rejected', reason: 'wrongStep' })]);
    expect(store.getState().inventory.ownedTypeIds).toEqual(owned);
  });

  it('VERIFY-MEC-002-021 save-v1 (celebration null) publishes nothing on start()', () => {
    const content = validContent();
    const { loaded } = boot(content, fixtureText('save-v1.json'));
    const store = createStore(content, loaded.state);
    const seen: SimEvent[] = [];
    store.subscribeAll(event => seen.push(event));
    store.start();
    expect(seen).toEqual([]);
  });
});

describe('VERIFY-MEC-009-020 mid-chain persistence', () => {
  it('VERIFY-MEC-009-020 partial: node half only (the "no pet sequence" device half is WORK-021, not-run (user, play session)): vignette save reloads at line 0', () => {
    const content = validContent();
    const saved = JSON.parse(fixtureText('save-v1.vignette.json'));
    const { loaded } = boot(content, JSON.stringify(saved));
    const { pets, inventory, dialogue } = loaded.state;
    expect(pets.dog.hearts).toBe(1);
    expect(pets.dog.fulfilledWantIds).toHaveLength(1);
    const reward = content.pets.dog.wants[0].reward;
    expect(reward).toEqual({ kind: 'types', typeIds: ['rug', 'cushion'] });
    if (reward.kind === 'types') expect(inventory.ownedTypeIds).toEqual(expect.arrayContaining(reward.typeIds));
    expect(dialogue.current).toMatchObject({ source: 'vignette', index: 0 });
    const store = createStore(content, loaded.state);
    const seen: SimEvent[] = [];
    store.subscribeAll(event => seen.push(event));
    store.start();
    expect(seen).toEqual([]);
    store.dispatch({ type: 'advanceDialogue' });
    expect(seen[0]).toEqual({ type: 'dialogue.advanced', index: 1 });
  });
});
