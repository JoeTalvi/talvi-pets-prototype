// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { doorEnabled, inputFrozen } from '../../src/sim/select';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { BUBBLE_DEPTH, REACTION_EMOJI } from '../../src/view/objects/Bubble';
import { files, patchFiles } from '../content/helpers';
import { owing } from '../sim/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';
import { linesOf, REAL_STRINGS } from './designHarness';

/** The director's timers never fire here: the test dispatches the celebration's steps itself. */
beforeEach(() => { directorClock.create = () => ({ now: () => 0, after: () => () => {} }); });
afterEach(() => { destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; });

const content = loadContent(undefined, patchFiles(files(), REAL_STRINGS));
const door = content.street.houses.find(h => h.projectId === 'pet-house')!.arrivalPath.at(-1)!;
const frontDoor = content.street.houses.find(h => h.projectId === 'pet-house')!.door;
type Syncable = { syncScene(ms: number): void };
const run = (scene: StreetScene, ms: number) => { for (let t = 0; t < ms; t += 50) (scene as unknown as Syncable).syncScene(50); };

async function completing() {
  const context = contextFor(content, owing(content, 4, 1500));
  const scene = await bootScene(StreetScene, context);
  for (const type of ['cutsceneFinished', 'collectRewards', 'closeReveal'] as const) {
    if (type === 'cutsceneFinished') context.store.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
    context.store.dispatch({ type });
  }
  return { context, scene };
}

describe('fork 5 arrival stub', () => {
  const t = 'fork 5 arrival stub (presentation §7.6 hook; the walk is WORK-023; HEADLESS jsdom, syncScene deltas) — ';
  it(`${t}arrival.started → one 🎵 Bubble at depth 8000 at the arrivalPath door point; after bubbleMs + 200 ms exactly one arrivalFinished → arrival.finished, arrivalDone, the pet-front door enabled, input unfrozen once the completion dialogue is drained`, async () => {
    const { context, scene } = await completing();
    expect(linesOf(context, 'arrival.started')).toHaveLength(1);
    const stub = scene.arrival!;
    expect([stub.bubble.depth, stub.bubble.x, stub.bubble.y, stub.bubble.current()]).toEqual([BUBBLE_DEPTH, door.x, door.y,
      { kind: 'emoji', class: 'greeting', text: REACTION_EMOJI.greeting }]);
    expect(inputFrozen(content, context.store.getState())).toBe(true);
    run(scene, content.tuning.bubbleMs - 100);
    expect(linesOf(context, 'action.dispatched').filter(l => l.action === 'arrivalFinished')).toHaveLength(0);
    expect(linesOf(context, 'arrival.finished')).toHaveLength(0);
    run(scene, 300);
    run(scene, 5000);
    expect(linesOf(context, 'arrival.finished')).toHaveLength(1);
    // The completion message dialogue (mec-002 §2.5 closeReveal) is the only remaining freeze; the dialogue panel drains it in play.
    for (let i = 0; i < 10 && context.store.getState().dialogue.current !== null; i++) context.store.dispatch({ type: 'advanceDialogue' });
    const state: GameState = context.store.getState();
    expect([state.arrival, state.projects['pet-house'].arrivalDone, inputFrozen(content, state), scene.arrival]).toEqual([null, true, false, null]);
    expect([frontDoor.id, doorEnabled(content, state, frontDoor)]).toEqual(['pet-front', true]);
    expect(linesOf(context, 'action.rejected')).toEqual([]);
  });

  it(`${t}a boot with state.arrival set replays the stub and finishes it once`, async () => {
    const { context: first } = await completing();
    const saved = structuredClone(first.store.getState());
    destroyScene();
    expect(saved.arrival).not.toBeNull();
    const context = contextFor(content, saved);
    const scene = await bootScene(StreetScene, context);
    expect(scene.arrival?.bubble.current()?.text).toBe(REACTION_EMOJI.greeting);
    run(scene, content.tuning.bubbleMs + 200);
    expect([linesOf(context, 'arrival.finished').length, context.store.getState().arrival]).toEqual([1, null]);
  });

  it(`${t}state.reset mid-stub dispatches nothing`, async () => {
    const { context, scene } = await completing();
    const stub = scene.arrival!;
    run(scene, 500);
    context.store.dispatch({ type: 'reset', seed: 3 });
    expect(stub.finished).toBe(true);
    run(scene, 5000);
    stub.update(5000);
    expect(linesOf(context, 'arrival.finished')).toHaveLength(0);
  });
});
