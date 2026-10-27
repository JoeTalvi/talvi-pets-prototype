// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { doorEnabled, inputFrozen } from '../../src/sim/select';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { ARRIVAL_FADE_MS } from '../../src/view/celebration/ArrivalWalk';
import { BUBBLE_DEPTH, REACTION_EMOJI } from '../../src/view/objects/Bubble';
import { owing } from '../sim/helpers';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { linesOf } from './designHarness';

/** The director's timers never fire here: the test dispatches the celebration's steps itself. */
beforeEach(() => { directorClock.create = () => ({ now: () => 0, after: () => () => {} }); });
afterEach(() => { destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; });

/** Real content: the Pet House arrivalPath (1820,910) → (1500,860) → (1500,805), petSpeedRu 2 × roomUnitPx 240 = 480 px/s. */
const content = loadContent();
const house = content.street.houses.find(h => h.projectId === 'pet-house')!;
const path = house.arrivalPath;
const speed = content.tuning.petSpeedRu * content.tuning.roomUnitPx / 1000;
const seg = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
const doorMs = seg.reduce((a, b) => a + b, 0) / speed;
const owl = realManifest.entries.find(e => e.id === 'pets/owl-sheet')!;
type Syncable = { syncScene(ms: number): void };
const run = (scene: StreetScene, ms: number, step = 10) => { for (let t = 0; t < ms; t += step) (scene as unknown as Syncable).syncScene(Math.min(step, ms - t)); };
type Context = ReturnType<typeof contextFor>;
/** The log records events, not actions: count the view's `arrivalFinished` dispatches with a store wrapper. */
const dispatched = new WeakMap<Context, string[]>();
function spy(context: Context): Context {
  const types: string[] = [], dispatch = context.store.dispatch.bind(context.store);
  context.store.dispatch = action => { types.push(action.type); return dispatch(action); };
  dispatched.set(context, types);
  return context;
}
const finishes = (context: Context) => (dispatched.get(context) ?? []).filter(type => type === 'arrivalFinished');

async function completing(withSheet = true) {
  const context = spy(contextFor(content, owing(content, 4, content.projects.find(p => p.id === 'pet-house')!.goalCents)));
  context.manifest = realManifest;
  const scene = await bootScene(StreetScene, context);
  if (withSheet) addTexture(scene, 'pets/owl-sheet', owl.px!.w, owl.px!.h, owl.frame);
  context.store.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
  for (const type of ['cutsceneFinished', 'collectRewards', 'closeReveal'] as const) context.store.dispatch({ type });
  return { context, scene };
}

describe('presentation §7.6 arrival walk', () => {
  const t = 'presentation §7.6 arrival walk — ';
  it(`${t}path, speed, flip, depth, 🎵, fade, arrivalFinished once (HEADLESS jsdom, real content, syncScene deltas)`, async () => {
    const { context, scene } = await completing();
    expect(linesOf(context, 'arrival.started')).toEqual([expect.objectContaining({ projectId: 'pet-house', petId: 'owl', doorId: 'pet-front' })]);
    const walk = scene.arrival!;
    const sprite = walk.sprite;
    expect([sprite.x, sprite.y]).toEqual([path[0].x, path[0].y]);
    expect([1820, 910]).toEqual([path[0].x, path[0].y]);
    expect(sprite.anims.currentAnim?.key).toBe('pet-owl-walk');
    expect(sprite.flipX).toBe(true);
    expect(sprite.depth).toBeGreaterThan(scene.houses.get('pet-house')!.depth);
    expect(Math.round(doorMs)).toBe(789);
    expect(walk.plan).toEqual({ doorMs, fadeMs: doorMs + content.tuning.bubbleMs, finishMs: doorMs + content.tuning.bubbleMs + ARRIVAL_FADE_MS });
    run(scene, 300);
    const f = 300 * speed / seg[0];
    expect(Math.abs(sprite.x - (path[0].x + (path[1].x - path[0].x) * f))).toBeLessThan(1);
    expect(Math.abs(sprite.y - (path[0].y + (path[1].y - path[0].y) * f))).toBeLessThan(1);
    expect([sprite.flipX, walk.bubble.current()]).toEqual([true, null]);
    expect(inputFrozen(content, context.store.getState())).toBe(true);
    expect(doorEnabled(content, context.store.getState(), house.door)).toBe(false);
    run(scene, Math.ceil(doorMs) - 300);
    expect([sprite.x, sprite.y, sprite.flipX]).toEqual([path.at(-1)!.x, path.at(-1)!.y, true]);
    expect(sprite.anims.currentAnim?.key).toBe('pet-owl-idle');
    expect(walk.timeline.find(b => b.beat === 'door')!.atMs).toBeCloseTo(doorMs, -1);
    expect([walk.bubble.depth, walk.bubble.x, walk.bubble.y, walk.bubble.current()]).toEqual([BUBBLE_DEPTH,
      sprite.bubbleAnchor().x, sprite.bubbleAnchor().y, { kind: 'emoji', class: 'greeting', text: REACTION_EMOJI.greeting }]);
    run(scene, content.tuning.bubbleMs + ARRIVAL_FADE_MS - 30);
    expect(finishes(context)).toHaveLength(0);
    expect(sprite.alpha).toBeLessThan(1);
    run(scene, 40);
    run(scene, 5000);
    expect(finishes(context)).toHaveLength(1);
    expect(linesOf(context, 'arrival.finished')).toEqual([expect.objectContaining({ petId: 'owl' })]);
    expect(walk.timeline.map(b => b.beat)).toEqual(['walk', 'door', 'greeting', 'fade', 'finished']);
    expect([walk.finished, sprite.active, scene.arrival]).toEqual([true, false, null]);
    // The held completion dialogue (mec-002 §2.5 closeReveal) is the only remaining freeze; the dialogue panel drains it in play.
    for (let i = 0; i < 10 && context.store.getState().dialogue.current !== null; i++) context.store.dispatch({ type: 'advanceDialogue' });
    const state: GameState = context.store.getState();
    expect([state.arrival, state.projects['pet-house'].arrivalDone, inputFrozen(content, state)]).toEqual([null, true, false]);
    expect([house.door.id, doorEnabled(content, state, house.door)]).toEqual(['pet-front', true]);
    expect(state.pets.owl.behaviour.phase).not.toBe('walking');
    expect(linesOf(context, 'action.rejected')).toEqual([]);
  });

  it(`${t}a 100 ms frame (dtClampMs) reaches the same beats: frame-rate independent`, async () => {
    const { context, scene } = await completing();
    run(scene, Math.ceil(doorMs + content.tuning.bubbleMs + ARRIVAL_FADE_MS) + 100, content.tuning.dtClampMs);
    expect(finishes(context)).toHaveLength(1);
  });

  it(`${t}reload with state.arrival replays from the first point and finishes once`, async () => {
    const { context: first } = await completing();
    const saved = structuredClone(first.store.getState());
    destroyScene();
    expect(saved.arrival).toEqual({ projectId: 'pet-house', petId: 'owl' });
    const context = spy(contextFor(content, saved));
    context.manifest = realManifest;
    const scene = await bootScene(StreetScene, context);
    const walk = scene.arrival!;
    expect([walk.sprite.x, walk.sprite.y, walk.sprite.texture.key]).toEqual([path[0].x, path[0].y, 'missing']);
    expect(walk.sprite.clipFor({ phase: 'walking', verb: null })).toBe('pet-owl-walk');
    run(scene, doorMs + content.tuning.bubbleMs + ARRIVAL_FADE_MS + 100, 50);
    expect([finishes(context).length, linesOf(context, 'arrival.finished').length, context.store.getState().arrival]).toEqual([1, 1, null]);
  });

  it(`${t}state.reset mid-walk dispatches nothing`, async () => {
    const { context, scene } = await completing();
    const walk = scene.arrival!;
    run(scene, 500);
    context.store.dispatch({ type: 'reset', seed: 3 });
    expect([walk.finished, scene.arrival]).toEqual([true, null]);
    run(scene, 5000);
    walk.update(5000);
    expect(finishes(context)).toHaveLength(0);
    expect(linesOf(context, 'arrival.finished')).toHaveLength(0);
  });
});
