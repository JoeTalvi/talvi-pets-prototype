import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState } from '../../src/sim/state';
import { SAVE_SCHEMA_VERSION, parseSaveValue } from '../../src/sim/state.schema';
import { starsOf, starsOfSpace, wantConditions } from '../../src/sim/select';
import { checkInvariants } from '../../src/sim/invariants';

/** WORK-034-2: the garden site and the Owl's mate on real content (VERIFY-T2-SITE-001, 003..011). */
const content = loadContent();
const garden = { kind: 'site', siteId: 'garden' } as const;
const saved = (name: string): GameState => {
  const loaded = parseSaveValue(content, JSON.parse(readFileSync(`tests/view/capture/${name}.real.json`, 'utf8')));
  if (!('state' in loaded)) throw new Error(`${name} discarded: ${loaded.discarded}`);
  return loaded.state;
};
function run(state: GameState, actions: Action[]): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (const action of actions) { const result = reduce(content, state, action); state = result.state; events.push(...result.events); }
  return { state, events };
}
const types = (events: SimEvent[]) => events.map(event => event.type);
const tick = (dtMs = 100): Action => ({ type: 'tick', dtMs, move: { x: 0, y: 0 } });
const drain = (state: GameState) => { while (state.dialogue.current) state = reduce(content, state, { type: 'advanceDialogue' }).state; return state; };

it('VERIFY-T2-SITE-001 garden loads: 5 small + 1 large slots, 2 wander points, spawn, arrivalPath, art ids, arrivalAtStars 8', () => {
  const [site] = content.street.sites;
  expect(site.id).toBe('garden');
  expect(site.slots.filter(slot => slot.sizeClass === 'small')).toHaveLength(5);
  expect(site.slots.filter(slot => slot.sizeClass === 'large')).toHaveLength(1);
  expect(site.wanderPoints).toHaveLength(2);
  expect(site.arrivalPath.at(-1)).toEqual({ x: site.petSpawn.x, y: site.petSpawn.y });
  expect(site.art).toEqual({ empty: 'world/site-garden-empty', base: 'world/site-garden-base' });
  expect(site.arrivalAtStars).toBe(8);
  expect(content.pets['owl-mate'].home).toEqual({ kind: 'space', siteId: 'garden' });
  expect(content.pets['owl-mate'].lines.stripped.length).toBeGreaterThanOrEqual(1);
});

it('VERIFY-T2-SITE-003 the Owl second Heart unlocks the garden with its two charms, in event order', () => {
  const fx = saved('site-unlocked');
  const steps = JSON.parse(readFileSync('tests/view/capture/site-unlocked.steps.json', 'utf8')) as { steps: { action: Action }[] };
  let state = initialState(content, 1234);
  // replay up to (not including) the second debugFulfilActiveWant and fulfil the Owl's glow-among-leaves there
  const fulfils = steps.steps.map((step, index) => step.action.type === 'debugFulfilActiveWant' ? index : -1).filter(i => i >= 0);
  for (const step of steps.steps.slice(0, fulfils[1])) state = step.action.type === 'advanceDialogue' ? drain(state) : reduce(content, state, step.action).state;
  expect(state.pets.owl.fulfilledWantIds).toEqual(['leafy-perch']);
  const { events, state: after } = run(state, [{ type: 'debugFulfilActiveWant', petId: 'owl' }]);
  const order = types(events).filter(type => ['want.fulfilled', 'space.unlocked', 'items.granted', 'heart.earned'].includes(type));
  expect(order).toEqual(['want.fulfilled', 'space.unlocked', 'items.granted', 'items.granted', 'heart.earned']);
  expect(events.find(event => event.type === 'space.unlocked')).toEqual({ type: 'space.unlocked', siteId: 'garden', petId: 'owl', wantId: 'glow-among-leaves' });
  expect(events.filter(event => event.type === 'items.granted').map(event => event.type === 'items.granted' && [event.typeId, event.count]))
    .toEqual([['potted-tree', 1], ['night-light', 1]]);
  expect(after.spaces.garden.unlocked).toBe(true);
  expect(after.pets.owl.hearts).toBe(2);
  expect(fx.spaces.garden.unlocked).toBe(true);
});

it('VERIFY-T2-SITE-004 design mode on the street only once a site is unlocked; interiors unchanged', () => {
  const locked = initialState(content, 1);
  const rejected = reduce(content, locked, { type: 'setDesignMode', on: true });
  expect(rejected.state).toBe(locked);
  expect(rejected.events).toEqual([{ type: 'action.rejected', action: { type: 'setDesignMode', on: true }, reason: 'siteLocked' }]);
  const unlocked = run(locked, [{ type: 'debugUnlockSpace', siteId: 'garden' }, { type: 'setDesignMode', on: true }]);
  expect(unlocked.state.mode).toBe('design');
  expect(unlocked.events.at(-1)).toEqual({ type: 'mode.changed', mode: 'design' });
  expect(checkInvariants(content, unlocked.state)).toEqual([]);
});

it('VERIFY-T2-SITE-005 outdoor place spends, remove returns, Stars per space; mismatch and zero-count rejected', () => {
  const start = run(saved('site-unlocked'), [{ type: 'setDesignMode', on: true }]).state;
  const roomStars = starsOf(content, start, 'dog-room').points;
  const placed = run(start, [
    { type: 'placeCharm', slotId: 'garden-large-1', typeId: 'potted-tree' },
    { type: 'placeCharm', slotId: 'garden-small-3', typeId: 'night-light' },
    { type: 'removeCharm', slotId: 'garden-small-3' },
  ]);
  const stars = placed.events.filter(event => event.type === 'space.stars.changed').map(event => event.type === 'space.stars.changed' && [event.from, event.to]);
  expect(stars).toEqual([[0, 4], [4, 8], [8, 4]]);
  expect(placed.events.find(event => event.type === 'charm.placed')).toMatchObject({ siteId: 'garden', slotId: 'garden-large-1' });
  expect(placed.events.some(event => event.type === 'stars.changed')).toBe(false);
  expect(placed.state.inventory.counts['potted-tree']).toBe(start.inventory.counts['potted-tree'] - 1);
  expect(placed.state.inventory.counts['night-light']).toBe(start.inventory.counts['night-light']);
  expect(starsOf(content, placed.state, 'dog-room').points).toBe(roomStars);
  const mismatch = reduce(content, placed.state, { type: 'placeCharm', slotId: 'garden-small-1', typeId: 'potted-tree' });
  expect(mismatch.events[0]).toMatchObject({ reason: 'sizeClassMismatch' });
  const none = run(placed.state, [{ type: 'removeCharm', slotId: 'garden-large-1' }, { type: 'placeCharm', slotId: 'garden-small-1', typeId: 'night-light' },
    { type: 'placeCharm', slotId: 'garden-small-2', typeId: 'night-light' }]);
  expect(none.events.at(-1)).toMatchObject({ type: 'action.rejected', reason: 'noCopiesLeft' });
});

it('VERIFY-T2-SITE-006 8 stars start the mate arrival on leaving design mode, once; not below 8, not mid-design', () => {
  const start = run(saved('site-unlocked'), [{ type: 'setDesignMode', on: true },
    { type: 'placeCharm', slotId: 'garden-large-1', typeId: 'potted-tree' }]);
  expect(run(start.state, [{ type: 'setDesignMode', on: false }]).events.some(event => event.type === 'space.arrivalStarted')).toBe(false);
  const eight = run(start.state, [{ type: 'placeCharm', slotId: 'garden-small-3', typeId: 'night-light' }]);
  expect(eight.events.some(event => event.type === 'space.arrivalStarted')).toBe(false);
  const left = run(eight.state, [{ type: 'setDesignMode', on: false }]);
  expect(left.events.filter(event => event.type === 'space.arrivalStarted')).toEqual([{ type: 'space.arrivalStarted', siteId: 'garden', petId: 'owl-mate' }]);
  expect(left.state.siteArrival).toEqual({ siteId: 'garden', petId: 'owl-mate' });
  const done = drain(run(left.state, [{ type: 'arrivalFinished' }]).state);
  const again = run(done, [{ type: 'setDesignMode', on: true }, { type: 'setDesignMode', on: false }]);
  expect(again.events.some(event => event.type === 'space.arrivalStarted')).toBe(false);
});

it('VERIFY-T2-SITE-007 arrival finish introduces the mate; project arrivals unchanged', () => {
  const pre = run(saved('site-unlocked'), [{ type: 'setDesignMode', on: true },
    { type: 'placeCharm', slotId: 'garden-large-1', typeId: 'potted-tree' },
    { type: 'placeCharm', slotId: 'garden-small-3', typeId: 'night-light' }, { type: 'setDesignMode', on: false }]).state;
  const { state, events } = run(pre, [{ type: 'arrivalFinished' }]);
  expect(types(events).slice(0, 2)).toEqual(['arrival.finished', 'pet.arrived']);
  expect(events[1]).toEqual({ type: 'pet.arrived', petId: 'owl-mate', siteId: 'garden' });
  expect(events.find(event => event.type === 'want.activated')).toEqual({ type: 'want.activated', petId: 'owl-mate', wantId: 'garden-supper', index: 0 });
  expect(state.spaces.garden.arrivalDone).toBe(true);
  expect(state.pets['owl-mate']).toMatchObject({ introduced: true, outside: true });
  expect(state.dialogue.current?.source).toBe('intro');
  const project = reduce(content, saved('site-unlocked'), { type: 'arrivalFinished' });
  expect(project.events[0]).toMatchObject({ reason: 'noArrival' });
});

it('VERIFY-T2-SITE-008 the mate wants read the site only; greeted inert and last; the debug arm passes it', () => {
  let state = run(saved('mate-arrived'), [{ type: 'debugGrantCopies', typeId: 'food-bowl', count: 1 },
    { type: 'debugGrantCopies', typeId: 'stool', count: 1 }, { type: 'setDesignMode', on: true }]).state;
  const supper = run(state, [{ type: 'placeCharm', slotId: 'garden-small-1', typeId: 'food-bowl' }]);
  expect(supper.events.find(event => event.type === 'want.fulfilled')).toMatchObject({ petId: 'owl-mate', wantId: 'garden-supper' });
  state = drain(supper.state);
  const seat = run(state, [{ type: 'placeCharm', slotId: 'garden-small-5', typeId: 'stool' }]);
  expect(seat.events.find(event => event.type === 'want.fulfilled')).toMatchObject({ wantId: 'garden-seat' });
  state = drain(seat.state);
  expect(wantConditions(content, state, 'owl-mate')).toEqual([{ kind: 'greeted', met: false, hidden: false, withPetId: 'owl' }]);
  const debug = run(state, [{ type: 'debugFulfilActiveWant', petId: 'owl-mate' }]);
  expect(debug.state.pets['owl-mate'].hearts).toBe(3);
  expect(types(debug.events)).toContain('wants.exhausted');
});

it('VERIFY-T2-SITE-008 room placements do not count for the mate', () => {
  const state = saved('mate-arrived');
  expect(wantConditions(content, state, 'owl-mate').filter(view => view.kind === 'tag').map(view => view.met)).toEqual([false, true]);
});

it('VERIFY-T2-SITE-009 the mate alternates between its two wander points on the street; deterministic; Dog and Owl not outside', () => {
  const walk = (seed: number) => {
    let state = { ...saved('mate-arrived'), pets: { ...saved('mate-arrived').pets } };
    state.pets['owl-mate'] = { ...state.pets['owl-mate'], rngState: seed };
    const targets: string[] = [];
    for (let i = 0; i < 600; i++) {
      const result = reduce(content, state, tick());
      for (const event of result.events)
        if (event.type === 'pet.phaseChanged' && event.petId === 'owl-mate' && event.to === 'walking' && event.target && 'wanderPointId' in event.target) targets.push(event.target.wanderPointId);
      state = result.state;
      const { x, y } = state.pets['owl-mate'].behaviour;
      expect(x).toBeGreaterThanOrEqual(80); expect(x).toBeLessThanOrEqual(1840); expect(y).toBeGreaterThanOrEqual(780); expect(y).toBeLessThanOrEqual(1010);
    }
    return targets;
  };
  const targets = walk(1);
  expect(targets.length).toBeGreaterThanOrEqual(2);
  targets.forEach((target, i) => expect(target).toBe(i % 2 === 0 ? 'garden-w2' : 'garden-w1'));
  expect(walk(1)).toEqual(targets);
  const before = saved('site-unlocked');
  expect(reduce(content, before, tick()).state.pets['owl-mate'].behaviour).toEqual(before.pets['owl-mate'].behaviour);
  expect([before.pets.dog.outside, before.pets.owl.outside, before.pets['owl-mate'].outside]).toEqual([false, false, true]);
});

it('VERIFY-T2-SITE-010 debug arms: debug.applied, fill reaches 8 stars through place events, invalid payloads rejected', () => {
  const fresh = initialState(content, 7);
  expect(reduce(content, fresh, { type: 'debugFillSpace', siteId: 'garden' }).events[0]).toMatchObject({ reason: 'siteLocked' });
  const unlocked = reduce(content, fresh, { type: 'debugUnlockSpace', siteId: 'garden' });
  expect(types(unlocked.events)).toEqual(['debug.applied', 'space.unlocked']);
  const filled = reduce(content, unlocked.state, { type: 'debugFillSpace', siteId: 'garden' });
  expect(filled.events[0].type).toBe('debug.applied');
  expect(types(filled.events).filter(type => type === 'charm.placed')).toHaveLength(2);
  expect(starsOfSpace(content, filled.state, garden).points).toBeGreaterThanOrEqual(8);
  expect(filled.state.siteArrival).toEqual({ siteId: 'garden', petId: 'owl-mate' });
  const greeted = reduce(content, fresh, { type: 'debugFulfilActiveWant', petId: 'owl' });
  expect(types(greeted.events).slice(0, 2)).toEqual(['debug.applied', 'want.fulfilled']);
  for (const bad of [{ type: 'debugUnlockSpace' }, { type: 'debugFillSpace', siteId: 3 }, { type: 'debugFulfilActiveWant', petId: null }])
    expect(reduce(content, fresh, bad as unknown as Action).events[0]).toMatchObject({ reason: 'invalidPayload' });
  expect(reduce(content, fresh, { type: 'debugUnlockSpace', siteId: 'nope' }).events[0]).toMatchObject({ reason: 'unknownSite' });
  expect(reduce(content, fresh, { type: 'debugFulfilActiveWant', petId: 'nope' }).events[0]).toMatchObject({ reason: 'unknownPet' });
});

it('VERIFY-T2-SITE-011 a mate-arrived save round-trips; schemaVersion unchanged (2)', () => {
  const state = saved('mate-arrived');
  const text = JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', state });
  expect(parseSaveValue(content, JSON.parse(text))).toEqual({ state });
  expect(SAVE_SCHEMA_VERSION).toBe(2);
  expect(checkInvariants(content, state)).toEqual([]);
});
