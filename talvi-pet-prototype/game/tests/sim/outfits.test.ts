import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState } from '../../src/sim/state';
import { GameStateSchema, SAVE_SCHEMA_VERSION, parseSaveValue } from '../../src/sim/state.schema';
import { unlockedOutfitIds } from '../../src/sim/select';

/** WORK-037-2 (DEC-047, Q16(a)): avatar outfits on real content — persistence, the derived unlocks, the grant beats,
 * chooseOutfit and the debug arm. */
const content = loadContent();
const pre = (name: string) => JSON.parse(readFileSync(`tests/fixtures/pre-outfits/${name}.v2-bbc5c45.real.json`, 'utf8'));
const loaded = (value: unknown): GameState => {
  const result = parseSaveValue(content, value);
  if (!('state' in result)) throw new Error(`discarded: ${result.discarded}`);
  return result.state;
};
function run(state: GameState, actions: Action[]): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (const action of actions) { const result = reduce(content, state, action); state = result.state; events.push(...result.events); }
  return { state, events };
}
const types = (events: SimEvent[]) => events.map(event => event.type);
const wearing = (state: GameState, outfitId: string): GameState => ({ ...state, avatar: { ...state.avatar, outfitId } });
const save = (state: GameState) => ({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: '2026-11-02T00:00:00.000Z', state });

/** The Pet House completion through the real celebration: debug to the goal, then acknowledge → cutscene → collect. */
function completePetHouse(state: GameState) {
  return run({ ...state, session: { ...state.session, orientationShown: true } }, [
    { type: 'debugCompleteProject', projectId: 'pet-house' }, { type: 'acknowledgeProject', projectId: 'pet-house' },
    { type: 'cutsceneFinished' }, { type: 'collectRewards' }]);
}
/** The garden arrival on a pre-outfit save (as VERIFY-T2-SITE-007): fill the site to 8 Stars, leave design, finish. */
function arriveInGarden() {
  return run(loaded(pre('site-unlocked')), [{ type: 'setDesignMode', on: true },
    { type: 'placeCharm', slotId: 'garden-large-1', typeId: 'potted-tree' },
    { type: 'placeCharm', slotId: 'garden-small-3', typeId: 'night-light' }, { type: 'setDesignMode', on: false },
    { type: 'arrivalFinished' }]);
}

describe('persistence (Q16(a): additive field, schemaVersion 2)', () => {
  it('SAVE_SCHEMA_VERSION stays 2 and the initial state wears "default"', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(2);
    expect(initialState(content, 1).avatar.outfitId).toBe('default');
    expect(Object.keys(GameStateSchema.shape)).not.toContain('outfits');
  });
  it('a v2 save from before outfits (bbc5c45 bytes, no avatar.outfitId) loads wearing "default"', () => {
    const value = pre('mate-arrived');
    expect(value.state.avatar).not.toHaveProperty('outfitId');
    expect(loaded(value).avatar.outfitId).toBe('default');
  });
  it('a save wearing "cosy" round-trips', () => {
    const state = wearing(loaded(pre('owl-room-entry')), 'cosy');
    const back = loaded(JSON.parse(JSON.stringify(save(state))));
    expect(back.avatar.outfitId).toBe('cosy');
    expect(back).toEqual(state);
  });
  it('an outfit id unknown to content discards with unknownContentId; a known locked id is tolerated', () => {
    const fresh = initialState(content, 1);
    expect(parseSaveValue(content, save(wearing(fresh, 'tuxedo')))).toEqual({ discarded: 'unknownContentId' });
    expect(parseSaveValue(content, save(wearing(fresh, 'garden')))).toHaveProperty('state');
  });
});

describe('unlockedOutfitIds (derived, never stored)', () => {
  it('default only at the start', () => {
    expect(unlockedOutfitIds(content, initialState(content, 1))).toEqual(['default']);
  });
  it('pre-outfit saves derive their unlocks with no field written: Pet House complete → cosy; garden arrived → garden', () => {
    expect(unlockedOutfitIds(content, loaded(pre('owl-room-entry')))).toEqual(['default', 'cosy']);
    expect(unlockedOutfitIds(content, loaded(pre('mate-arrived')))).toEqual(['default', 'cosy', 'garden']);
  });
  it('content order, whatever order the beats happened in', () => {
    const state = initialState(content, 1);
    const onlyGarden = { ...state, spaces: { ...state.spaces, garden: { ...state.spaces.garden, arrivalDone: true } } };
    expect(unlockedOutfitIds(content, onlyGarden)).toEqual(['default', 'garden']);
  });
});

describe('grant beats (DEC-047, MEC-009)', () => {
  it('outfit.unlocked {cosy, completion, pet-house} right after project.completed, once; no celebration field added', () => {
    const { state, events } = completePetHouse(initialState(content, 1));
    const at = types(events).indexOf('project.completed');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(events[at + 1]).toEqual({ type: 'outfit.unlocked', outfitId: 'cosy', source: 'completion', projectId: 'pet-house' });
    expect(events.filter(event => event.type === 'outfit.unlocked')).toHaveLength(1);
    expect(Object.keys(state.celebration ?? {})).not.toContain('outfitId');
    expect(unlockedOutfitIds(content, state)).toEqual(['default', 'cosy']);
  });
  it('outfit.unlocked {garden, arrival, garden} right after pet.arrived, once', () => {
    const { state, events } = arriveInGarden();
    const at = types(events).indexOf('pet.arrived');
    expect(events[at + 1]).toEqual({ type: 'outfit.unlocked', outfitId: 'garden', source: 'arrival', siteId: 'garden' });
    expect(events.filter(event => event.type === 'outfit.unlocked')).toHaveLength(1);
    expect(unlockedOutfitIds(content, state)).toEqual(['default', 'cosy', 'garden']);
  });
  it('a project with no completionOutfitId emits no outfit.unlocked', () => {
    const edited = structuredClone(content);
    delete edited.projects.find(project => project.id === 'pet-house')!.completionOutfitId;
    let state: GameState = { ...initialState(edited, 1), session: { ...initialState(edited, 1).session, orientationShown: true } };
    const events: SimEvent[] = [];
    for (const action of [{ type: 'debugCompleteProject', projectId: 'pet-house' }, { type: 'acknowledgeProject', projectId: 'pet-house' },
      { type: 'cutsceneFinished' }, { type: 'collectRewards' }] as Action[]) {
      const result = reduce(edited, state, action); state = result.state; events.push(...result.events);
    }
    expect(types(events)).toContain('project.completed');
    expect(types(events)).not.toContain('outfit.unlocked');
  });
});

describe('chooseOutfit (MEC-001, CONTRACT-ACTIONS)', () => {
  const street = () => { const state = loaded(pre('owl-room-entry')); return { ...state, scene: { kind: 'street' as const } }; };
  it('an unlocked outfit: outfit.changed {from, to} and the state; the worn outfit again is a no-op', () => {
    const chosen = reduce(content, street(), { type: 'chooseOutfit', outfitId: 'cosy' });
    expect(chosen.events).toEqual([{ type: 'outfit.changed', from: 'default', to: 'cosy' }]);
    expect(chosen.state.avatar.outfitId).toBe('cosy');
    const again = reduce(content, chosen.state, { type: 'chooseOutfit', outfitId: 'cosy' });
    expect(again).toEqual({ state: chosen.state, events: [] });
  });
  it('locked, unknown and input-frozen choices are rejected with a reason and no state change', () => {
    const state = street();
    for (const [action, reason, from] of [
      [{ type: 'chooseOutfit', outfitId: 'garden' }, 'outfitLocked', state],
      [{ type: 'chooseOutfit', outfitId: 'tuxedo' }, 'unknownOutfit', state],
      [{ type: 'chooseOutfit', outfitId: 'cosy' }, 'inputFrozen', { ...state, dialogue: { current: { source: 'intro', speaker: { game: true }, lines: ['x'], index: 0 }, queue: [] } }],
      [{ type: 'chooseOutfit', outfitId: 7 }, 'invalidPayload', state],
    ] as [Action, string, GameState][]) {
      const result = reduce(content, from, action);
      expect(result).toEqual({ state: from, events: [{ type: 'action.rejected', action, reason }] });
    }
  });
  it('fork 5: design mode does not block a choice', () => {
    const result = reduce(content, { ...street(), mode: 'design' }, { type: 'chooseOutfit', outfitId: 'cosy' });
    expect(result.state.avatar.outfitId).toBe('cosy');
  });
  it('the worn outfit survives a door (scene change)', () => {
    const state: GameState = { ...wearing(loaded(pre('owl-room-entry')), 'cosy'), scene: { kind: 'interior', roomId: 'dog-room' } };
    const door = content.rooms['dog-room'].doors.find(d => d.target.scene === 'street')!;
    const walked = run({ ...state, avatar: { ...state.avatar, x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2, immunityMs: 0 } },
      [{ type: 'tick', dtMs: 16, move: { x: 0, y: 0 } }]);
    expect(types(walked.events)).toContain('scene.changed');
    expect(walked.state.avatar.outfitId).toBe('cosy');
  });
});

describe('debugSetOutfit (row 25 "Outfits")', () => {
  it('wears any known outfit regardless of its lock: debug.applied then outfit.changed', () => {
    const state = initialState(content, 1);
    const result = reduce(content, state, { type: 'debugSetOutfit', outfitId: 'garden' });
    expect(result.events).toEqual([{ type: 'debug.applied', action: { type: 'debugSetOutfit', outfitId: 'garden' } },
      { type: 'outfit.changed', from: 'default', to: 'garden' }]);
    expect(result.state.avatar.outfitId).toBe('garden');
  });
  it('an unknown id is rejected', () => {
    const state = initialState(content, 1), action: Action = { type: 'debugSetOutfit', outfitId: 'tuxedo' };
    expect(reduce(content, state, action)).toEqual({ state, events: [{ type: 'action.rejected', action, reason: 'unknownOutfit' }] });
  });
});
