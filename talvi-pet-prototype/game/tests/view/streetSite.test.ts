// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import { inputFrozen } from '../../src/sim/select';
import { siteOf } from '../../src/sim/space';
import { StreetScene, SITE_ART_DEPTH, GROUND_DEPTH, type ScenePointer } from '../../src/view/scenes/StreetScene';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { REACTION_EMOJI } from '../../src/view/objects/Bubble';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { linesOf } from './designHarness';

beforeEach(() => { directorClock.create = () => ({ now: () => 0, after: () => () => {} }); });
afterEach(() => { destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; });

/** Real content: the garden site (anchor {380, 955}, 5 small + 1 large, arrivalAtStars 8) and the Owl's mate. */
const content = loadContent();
const garden = siteOf(content, 'garden');
const ART = ['world/site-garden-empty', 'world/site-garden-base'];
const mateSheet = realManifest.entries.find(e => e.id === 'pets/owl-mate-sheet')!;
type Syncable = { syncScene(ms: number): void };
const run = (scene: StreetScene, ms: number, step = 10) => { for (let t = 0; t < ms; t += step) (scene as unknown as Syncable).syncScene(Math.min(step, ms - t)); };

async function street(state: GameState = initialState(content, 1)) {
  const context = contextFor(content, state);
  context.manifest = realManifest;
  const types: string[] = [], dispatch = context.store.dispatch.bind(context.store);
  context.store.dispatch = action => { types.push(action.type); return dispatch(action); };
  const scene = await bootScene(StreetScene, context, {}, ART);
  addTexture(scene, 'pets/owl-mate-sheet', mateSheet.px!.w, mateSheet.px!.h, mateSheet.frame);
  scene.cameras.main.emit('camerafadeincomplete');
  return { context, scene, types, finishes: () => types.filter(type => type === 'arrivalFinished').length };
}
let nextId = 1;
function tapAt(scene: StreetScene, x: number, y: number): void {
  const down: ScenePointer = { id: nextId++, worldX: x, worldY: y, downTime: 1000, upTime: 0 };
  scene.pointerDown(down);
  scene.pointerUp({ ...down, upTime: 1060 });
}
const shown = (scene: StreetScene) => [...scene.outlines.values()].filter(o => o.visible).map(o => o.slotId);
const slotCentre = (slotId: string) => { const s = garden.slots.find(slot => slot.id === slotId)!; return { x: s.x, y: s.y - 20 }; };

describe('VERIFY-T2-SITE-101 site art follows the lock state (DEC-044)', () => {
  it('empty art while locked, base art after space.unlocked and after a reload, depth above the tiles and below the world', async () => {
    const { context, scene } = await street();
    const art = scene.siteArt.get('garden')!;
    expect([art.texture.key, art.x, art.y, art.originX, art.originY]).toEqual(['world/site-garden-empty', 380, 955, 0.5, 1]);
    expect(art.depth).toBe(SITE_ART_DEPTH);
    expect(SITE_ART_DEPTH).toBeGreaterThan(GROUND_DEPTH);
    expect(Math.min(...[...scene.houses.values()].map(h => h.depth))).toBeGreaterThan(SITE_ART_DEPTH);
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    expect(scene.siteArt.get('garden')!.texture.key).toBe('world/site-garden-base');
    const reloaded = context.store.getState();
    destroyScene();
    const again = await street(reloaded);
    expect(again.scene.siteArt.get('garden')!.texture.key).toBe('world/site-garden-base');
  });
});

describe('VERIFY-T2-SITE-103 outlines and the chooser at the site only (gate fork 11, MEC-005)', () => {
  it('6 outlines at the site in design mode, none at the houses; a tap opens the chooser (slot.tapped), a placement draws the charm', async () => {
    const { context, scene } = await street();
    expect(scene.outlines.size).toBe(6);
    expect(shown(scene)).toEqual([]);
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    context.store.dispatch({ type: 'setDesignMode', on: true });
    expect(shown(scene).sort()).toEqual(garden.slots.map(s => s.id).sort());
    const taps: { slotId: string; filled: boolean }[] = [];
    context.bus.on('slot.tapped', event => taps.push({ slotId: event.slotId, filled: event.filled }));
    const { x, y } = slotCentre('garden-small-1');
    tapAt(scene, x, y);
    expect(taps).toEqual([{ slotId: 'garden-small-1', filled: false }]);
    const typeId = context.store.getState().inventory ? Object.keys(context.store.getState().inventory.counts)
      .find(id => content.charms.types.find(t => t.id === id)?.sizeClass === 'small' && context.store.getState().inventory.counts[id] > 0) : undefined;
    const small = typeId ?? content.charms.types.find(t => t.sizeClass === 'small')!.id;
    if (!typeId) context.store.dispatch({ type: 'debugGrantCopies', typeId: small, count: 1 });
    context.store.dispatch({ type: 'placeCharm', slotId: 'garden-small-1', typeId: small });
    expect(linesOf(context, 'charm.placed').at(-1)).toEqual(expect.objectContaining({ siteId: 'garden', slotId: 'garden-small-1', typeId: small }));
    const charm = scene.charms.get('garden-small-1')!;
    expect([charm.x, charm.y]).toEqual([120, 820]);
    expect(scene.outlines.get('garden-small-1')!.outlineState).toBe('filled');
    tapAt(scene, x, y);
    expect(taps.at(-1)).toEqual({ slotId: 'garden-small-1', filled: true });
    context.store.dispatch({ type: 'removeCharm', slotId: 'garden-small-1' });
    expect(scene.charms.has('garden-small-1')).toBe(false);
    context.store.dispatch({ type: 'setDesignMode', on: false });
    expect(shown(scene)).toEqual([]);
  });
});

describe('VERIFY-T2-SITE-105 / -104 the mate\'s site arrival walk and the mate on the street (DEC-044/045, presentation §7.6 variant)', () => {
  it('walks arrivalPath, 🎵 at the end, no fade, one arrivalFinished, hand-over to the street sprite at the last point; input unfreezes', async () => {
    const { context, scene, finishes } = await street();
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    expect(scene.pet).toBeUndefined();
    context.store.dispatch({ type: 'debugFillSpace', siteId: 'garden' });
    expect(linesOf(context, 'space.arrivalStarted')).toEqual([expect.objectContaining({ siteId: 'garden', petId: 'owl-mate' })]);
    const walk = scene.arrival!;
    expect(walk.fades).toBe(false);
    expect(walk.plan.finishMs).toBe(walk.plan.doorMs + content.tuning.bubbleMs);
    expect([walk.sprite.x, walk.sprite.y]).toEqual([garden.arrivalPath[0].x, garden.arrivalPath[0].y]);
    expect(inputFrozen(content, context.store.getState())).toBe(true);
    expect(scene.pet).toBeUndefined();
    run(scene, Math.ceil(walk.plan.doorMs) + 10);
    expect(walk.bubble.current()?.text).toBe(REACTION_EMOJI.greeting);
    expect(walk.sprite.alpha).toBe(1);
    const last = { x: walk.sprite.x, y: walk.sprite.y };
    run(scene, content.tuning.bubbleMs);
    expect(walk.finished).toBe(true);
    expect(finishes()).toBe(1);
    expect(linesOf(context, 'pet.arrived')).toEqual([expect.objectContaining({ petId: 'owl-mate', siteId: 'garden' })]);
    expect(scene.pet?.petId).toBe('owl-mate');
    expect([scene.pet!.x, scene.pet!.y]).toEqual([last.x, last.y]);
    expect(scene.pet!.anims.currentAnim?.key).toBe('pet-owl-mate-idle');
    expect(linesOf(context, 'want.activated').at(-1)).toEqual(expect.objectContaining({ petId: 'owl-mate', index: 0 }));
    expect(context.store.getState().siteArrival).toBeNull();
    run(scene, 500);
    expect(finishes()).toBe(1);
    expect(scene.children.list.filter(c => c.type === 'Sprite' && (c as { petId?: string }).petId === 'owl-mate').length).toBe(1);
  });

});

describe('VERIFY-T2-SITE-104 the mate on the street after a reload (DEC-045)', () => {
  it('absent before the arrival, present after a reload; synced from behaviour; a tap dispatches tapPet; a reload mid-walk replays it', async () => {
    const { context } = await street();
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    context.store.dispatch({ type: 'debugFillSpace', siteId: 'garden' });
    const midWalk = context.store.getState();
    destroyScene();
    const replay = await street(midWalk);
    expect(replay.scene.arrival?.arrival).toEqual({ siteId: 'garden', petId: 'owl-mate' });
    expect(replay.scene.pet).toBeUndefined();
    run(replay.scene, replay.scene.arrival!.plan.finishMs + 20);
    const after = replay.context.store.getState();
    destroyScene();
    const reloaded = await street(after);
    const pet = reloaded.scene.pet!;
    expect(pet.petId).toBe('owl-mate');
    const behaviour = reloaded.context.store.getState().pets['owl-mate'].behaviour;
    expect([pet.x, pet.y]).toEqual([behaviour.x, behaviour.y]);
    tapAt(reloaded.scene, pet.x, pet.y - 40);
    // The intro dialogue the arrival opened is still up, so the sim rejects it (dialogueOpen); the view's routing is what is pinned.
    expect(linesOf(reloaded.context, 'input.tap').at(-1)).toEqual(expect.objectContaining({ target: 'pet:owl-mate' }));
    expect(reloaded.types.at(-1)).toBe('tapPet');
  });
});

describe('VERIFY-WORK-038-3-06 garden beacon and space card (DEC-049 §7)', () => {
  const shown = (siteId = 'garden') => window.dispatchEvent(new CustomEvent('tpp:spaceToastShown', { detail: { siteId } }));
  it('VERIFY-WORK-038-3-06: the space toast takes the card styling with a punch and reveal, and fires tpp:spaceToastShown {siteId}', async () => {
    const { vi } = await import('vitest');
    const { mountOverlay } = await import('../../src/ui/overlay');
    const context = contextFor(content, initialState(content, 1));
    context.manifest = realManifest;
    const host = document.createElement('div'); document.body.append(host);
    mountOverlay(host, context);
    const play = vi.spyOn(context.audio!, 'play');
    const events: unknown[] = [];
    const onShown = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('tpp:spaceToastShown', onShown);
    try {
      context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
      const toast = host.querySelector<HTMLElement>('.tpp-toast')!;
      expect([toast.hidden, toast.dataset.kind, toast.classList.contains('tpp-toast-card')]).toEqual([false, 'space', true]);
      expect(play.mock.calls).toEqual([['reveal']]);
      expect(events).toEqual([{ siteId: 'garden' }]);
    } finally { window.removeEventListener('tpp:spaceToastShown', onShown); }
  });

  it('VERIFY-WORK-038-3-06: on the active street the site pulses 1.06 (GARDEN.pulseMs yoyo × 3), 16 confetti burst and a "New" bubble stays; no flash or shake', async () => {
    const { vi } = await import('vitest');
    const Phaser = (await import('phaser')).default;
    const { GARDEN } = await import('../../src/view/celebration/timings');
    const state = initialState(content, 1);
    state.spaces.garden.unlocked = true;
    const { scene } = await street(state);
    scene.cameras.main.emit('camerafadeincomplete');
    const explode = vi.spyOn(Phaser.GameObjects.Particles.ParticleEmitter.prototype, 'explode');
    const camShake = vi.spyOn(scene.cameras.main, 'shake');
    shown();
    const pulse = scene.tweens.getTweensOf(scene.siteArt.get('garden')!)[0];
    const d = pulse.data[0] as unknown as { duration: number; repeat: number; yoyo: boolean };
    expect([d.duration * 2, d.repeat, d.yoyo]).toEqual([GARDEN.pulseMs, 2, true]);
    expect(explode.mock.calls.map(c => c[0])).toEqual([GARDEN.confetti]);
    expect(scene.beaconBubble?.current()).toEqual({ kind: 'text', class: 'chatter', text: 'New' });
    expect(camShake).not.toHaveBeenCalled();
    explode.mockRestore();
  });

  it('VERIFY-WORK-038-3-06 fork (b): shown while no street is running, the beacon plays on the next Street create, once', async () => {
    const state = initialState(content, 1);
    state.spaces.garden.unlocked = true;
    const first = await street(state);
    destroyScene();
    shown();
    const { scene } = await street(state);
    expect(scene.beaconBubble?.current()?.text).toBe('New');
    destroyScene();
    const again = await street(state);
    expect(again.scene.beaconBubble).toBeUndefined();
    void first;
  });
});
