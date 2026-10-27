// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InteriorScene } from '../../src/view/scenes/InteriorScene';
import { loadContent } from '../../src/content/load';
import { parseSaveValue } from '../../src/sim/state.schema';
import type { GameState } from '../../src/sim/state';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { designIn, dogRoomDesign } from '../sim/helpers';
import { fixtureText } from '../app/helpers';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { readFileSync } from 'node:fs';
import { mountOverlay } from '../../src/ui/overlay';
import { registerClips } from '../../src/view/anims';
import { linesOf } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

/** Ends the 250 ms fade-in the sleeping test loop never finishes. */
const settle = (scene: InteriorScene) => { scene.cameras.main.emit('camerafadeincomplete'); };
const dogRoom = { roomId: 'dog-room' };

describe('VERIFY-PRES-009 depth rule', () => {
  it('VERIFY-PRES-009 charm depth = slot y (or depthOverride), avatar depth = its y, recomputed as it moves', async () => {
    const content = loadContent(manifest, patchFiles(files(), [
      { file: 'rooms/dog-room.json', path: '/slots/0/y', value: 700 },
      { file: 'rooms/dog-room.json', path: '/slots/0/anchor/y', value: 730 },
      { file: 'rooms/dog-room.json', path: '/slots/8/depthOverride', value: 1 },
    ]));
    const state = designIn(content, [], 1);
    state.avatar = { ...state.avatar, x: 600, y: 650 };
    const context = contextFor(content, state);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-1', typeId: 'painting' });
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/lamp', 'charms/painting', 'rooms/fixture']);
    settle(scene);
    expect(scene.charms.get('floor-1')!.depth).toBe(700);
    expect(scene.avatar.depth).toBe(650);
    expect(scene.charms.get('floor-1')!.depth).toBeGreaterThan(scene.avatar.depth);
    expect(scene.charms.get('wall-1')!.depth).toBe(1);
    context.store.dispatch({ type: 'setDesignMode', on: false });
    for (let i = 0; i < 200 && context.store.getState().avatar.y < 720; i++) context.store.dispatch({ type: 'tick', dtMs: 10, move: { x: 0, y: 1 } });
    scene.update(0, 0);
    const y = context.store.getState().avatar.y;
    expect(y).toBeGreaterThanOrEqual(720);
    expect(scene.avatar.y).toBe(y);
    expect(scene.avatar.depth).toBe(y);
    expect(scene.avatar.depth).toBeGreaterThan(scene.charms.get('floor-1')!.depth);
  });
});

describe('VERIFY-MEC-005-016 placements rebuilt from a save', () => {
  it('VERIFY-MEC-005-016 partial: jsdom half — FX-SAVE-V1 boots Interior with exactly its 3 CharmSprites at slot positions and depths (Chrome visual half: WORK-014-4 / WORK-021)', async () => {
    const content = validContent();
    const parsed = parseSaveValue(content, JSON.parse(fixtureText('save-v1.json')));
    expect('state' in parsed).toBe(true);
    const state = (parsed as { state: GameState }).state;
    const context = contextFor(content, state);
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/dog-bed', 'charms/lamp']);
    const sprites = [...scene.charms.entries()].map(([slot, s]) => [slot, s.x, s.y, s.depth, s.texture.key]);
    expect(sprites.sort()).toEqual([
      ['floor-3', 460, 450, 450, 'charms/lamp'],
      ['floor-5', 720, 450, 450, 'missing'],
      ['large-1', 1250, 550, 550, 'charms/dog-bed'],
    ]);
    expect(scene.children.list.filter(c => c.constructor.name === 'CharmSprite')).toHaveLength(3);
    expect(context.store.getState().rooms['dog-room'].placements).toEqual(JSON.parse(fixtureText('save-v1.json')).state.rooms['dog-room'].placements);
  });
});

describe('mec-007 PetSprite', () => {
  it('VERIFY-MEC-007-016 partial: clip mapping and depth (jsdom) — idle at petSpawn facing left, phase → clip, sync copies pose', async () => {
    const { content, state } = dogRoomDesign();
    const context = contextFor(content, state);
    const scene = await bootScene(InteriorScene, context, dogRoom, ['rooms/fixture']);
    const pet = scene.pet!;
    expect([pet.x, pet.y, pet.flipX, pet.depth]).toEqual([800, 700, true, 700]);
    expect(pet.anims.currentAnim?.key).toBe('pet-dog-idle');
    expect(pet.clipFor({ phase: 'walking', verb: null })).toBe('pet-dog-walk');
    expect(pet.clipFor({ phase: 'using', verb: 'nap' })).toBe('pet-dog-use-lie');
    expect(pet.clipFor({ phase: 'using', verb: 'look-at' })).toBe('pet-dog-use-look');
    expect(pet.clipFor({ phase: 'reacting', verb: null })).toBe('pet-dog-idle');
    expect(pet.clipFor({ phase: 'greeting', verb: null })).toBe('pet-dog-idle');
    pet.sync({ x: 300, y: 650, facing: 'right' });
    expect([pet.x, pet.y, pet.flipX, pet.depth]).toEqual([300, 650, false, 650]);
  });

  it('mec-007 PetSprite switches clip on pet.phaseChanged from the store (never by polling)', async () => {
    const { content, state } = dogRoomDesign();
    const context = contextFor(content, state);
    const scene = await bootScene(InteriorScene, context, dogRoom, ['rooms/fixture']);
    const seen: string[] = [];
    context.store.subscribe('pet.phaseChanged', event => { seen.push(event.to); });
    context.store.dispatch({ type: 'setDesignMode', on: false });
    for (let i = 0; i < 400 && !seen.includes('walking'); i++) context.store.dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: 0 } });
    expect(seen).toContain('walking');
    expect(seen.at(-1)).toBe('walking');
    expect(scene.pet!.anims.currentAnim?.key).toBe('pet-dog-walk');
  });

  it('mec-007 PetSprite bubbleAnchor partial: fallback — HEADLESS canvas has no readable pixels, so the offset is the measured Dog value 125', async () => {
    const { content, state } = dogRoomDesign();
    const scene = await bootScene(InteriorScene, contextFor(content, state), dogRoom, ['rooms/fixture']);
    const pet = scene.pet!;
    expect(pet.bubbleOffsetMeasured).toBe(false);
    expect(pet.bubbleAnchor()).toEqual({ x: 800, y: 700 - 125 });
    expect(pet.idleFrameTexture()).toEqual({ key: 'pets/dog-sheet', frame: 0 });
  });
});

describe('presentation §5.2 door fade', () => {
  it('presentation §5.2 door fade — scene.changed sets transitioning, fades out 250 ms, freezes move, then starts Street', async () => {
    const content = validContent();
    const base = designIn(content, [], 1);
    const state: GameState = { ...base, mode: 'play', avatar: { ...base.avatar, x: 500, y: 240 } };
    const context = contextFor(content, state);
    const scene = await bootScene(InteriorScene, context, dogRoom, ['rooms/fixture']);
    settle(scene);
    const fadeOut = vi.spyOn(scene.cameras.main, 'fadeOut');
    const start = vi.spyOn(scene.scene, 'start').mockImplementation(() => scene.scene);
    let changed = false;
    context.store.subscribe('scene.changed', () => { changed = true; });
    for (let i = 0; i < 50 && !changed; i++) context.store.dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: -1 } });
    expect(changed).toBe(true);
    expect(scene.transitioning).toBe(true);
    expect(fadeOut).toHaveBeenCalledWith(250);
    const dispatch = vi.spyOn(context.store, 'dispatch');
    scene.update(0, 16);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'tick', dtMs: 16, move: { x: 0, y: 0 } });
    expect(start).not.toHaveBeenCalled();
    scene.cameras.main.emit('camerafadeoutcomplete');
    expect(start).toHaveBeenCalledWith('Street', {});
  });
});

describe('painting projection fallback', () => {
  it('order fork 6: a painting whose manifest hash differs from the reviewed profile draws unprojected and records one app.error', async () => {
    const content = validContent();
    const state = designIn(content, [], 1);
    const context = contextFor(content, state);
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-1', typeId: 'painting' });
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-2', typeId: 'picture' });
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/painting', 'rooms/fixture']);
    expect(scene.charms.get('wall-1')!.texture.key).toBe('charms/painting');
    expect(scene.charms.get('wall-1')!.wallProjection).toBeUndefined();
    expect(context.log.lines().filter(l => l.type === 'app.error')).toHaveLength(1);
  });
});

describe('wall charm facing (play-session Q3, 2026-10-26)', () => {
  it('a wall charm drawn for the left wall is mirrored on a right-wall slot and not on a left-wall slot', async () => {
    const content = loadContent(manifest, patchFiles(files(), [{ file: 'rooms/dog-room.json', path: '/slots/9/wall', value: 'right' }]));
    const state = designIn(content, [], 1);
    const context = contextFor(content, state);
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-1', typeId: 'picture' });
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-2', typeId: 'picture' });
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/picture', 'rooms/fixture']);
    expect(scene.charms.get('wall-1')!.flipX).toBe(false);
    expect(scene.charms.get('wall-2')!.flipX).toBe(true);
  });
});

describe('pet on a seated charm (play-session follow-up, 2026-10-26)', () => {
  const usingFloor1 = (seat: boolean) => {
    const patched = patchFiles(files(), seat ? [{ file: 'charms.json', path: '/types/9/seat', value: { y: 62 } }] : []);
    const content = loadContent(manifest, patched);
    const state = designIn(content, [], 1);
    state.mode = 'play';
    state.rooms['dog-room'].placements = { 'floor-1': 'cushion' };
    state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'using', target: { slotId: 'floor-1' }, verb: 'nap', x: 640, y: 720, facing: 'left' };
    return contextFor(content, state);
  };
  it('draws the pet on the charm seat, above the charm, while it uses a slot whose charm has a seat', async () => {
    const scene = await bootScene(InteriorScene, usingFloor1(true), dogRoom, ['charms/cushion', 'rooms/fixture']);
    const slot = scene.room.slots.find(s => s.id === 'floor-1')!, charm = scene.charms.get('floor-1')!;
    expect([scene.pet!.x, scene.pet!.y]).toEqual([slot.x, slot.y - 62]);
    expect(scene.pet!.depth).toBeGreaterThan(charm.depth);
  });
  it('keeps the pet at its anchor and base depth when the charm has no seat', async () => {
    const scene = await bootScene(InteriorScene, usingFloor1(false), dogRoom, ['charms/cushion', 'rooms/fixture']);
    expect([scene.pet!.x, scene.pet!.y, scene.pet!.depth]).toEqual([640, 720, 720]);
  });
});

describe('floor-standing wall charms (play-session finding, 2026-10-26)', () => {
  const withFloor = (floorY: boolean) => loadContent(manifest, patchFiles(files(), [
    { file: 'charms.json', path: '/types/13/standsOnFloor', value: true },
    ...(floorY ? [{ file: 'rooms/dog-room.json', path: '/slots/8/floorY', value: 420 }] : [])]));
  it('draws a standsOnFloor charm with its base on the wall slot floor line, at that depth', async () => {
    const content = withFloor(true);
    const context = contextFor(content, designIn(content, [], 1));
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-1', typeId: 'picture' });
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/picture', 'rooms/fixture']);
    const charm = scene.charms.get('wall-1')!;
    expect([charm.y, charm.depth]).toEqual([420, 420]);
  });
  it('falls back to the slot position when the slot has no floor line', async () => {
    const content = withFloor(false);
    const context = contextFor(content, designIn(content, [], 1));
    context.store.dispatch({ type: 'placeCharm', slotId: 'wall-1', typeId: 'picture' });
    const scene = await bootScene(InteriorScene, context, dogRoom, ['charms/picture', 'rooms/fixture']);
    expect([scene.charms.get('wall-1')!.y, scene.charms.get('wall-1')!.depth]).toEqual([300, 300]);
  });
});

/** WORK-023-2: the street save standing in the pet-front door after arrivalFinished (tests/view/capture/owl-room-entry.steps.json). */
const owlContent = loadContent();
const owlEntry = realManifest.entries.find(e => e.id === 'pets/owl-sheet')!;
const tickMs = 20;
async function enterOwlRoom() {
  const saved = (parseSaveValue(owlContent, JSON.parse(readFileSync('tests/view/capture/owl-room-entry.real.json', 'utf8'))) as { state: GameState }).state;
  const context = contextFor(owlContent, saved);
  context.manifest = realManifest;
  const host = document.createElement('div'); document.body.append(host);
  mountOverlay(host, context);
  const tick = (move = { x: 0, y: 0 }) => context.store.dispatch({ type: 'tick', dtMs: tickMs, move });
  for (let i = 0; i < 50 && context.store.getState().scene.kind === 'street'; i++) tick({ x: 0, y: -1 });
  const scene = await bootScene(InteriorScene, context, { roomId: 'owl-room' });
  addTexture(scene, 'pets/owl-sheet', owlEntry.px!.w, owlEntry.px!.h, owlEntry.frame);
  registerClips(scene, owlEntry);
  settle(scene);
  return { context, scene, tick, root: host.querySelector<HTMLElement>('#panels')! };
}

const perchOn = async (slotId: string, typeId: string) => {
  const env = await enterOwlRoom();
  const { context, tick } = env;
  for (let i = 0; i < 10 && context.store.getState().dialogue.current !== null; i++) context.store.dispatch({ type: 'advanceDialogue' });
  const owned = context.store.getState().inventory.ownedTypeIds;
  expect(owned).toContain(typeId);
  context.store.dispatch({ type: 'setDesignMode', on: true });
  context.store.dispatch({ type: 'placeCharm', slotId, typeId });
  expect(linesOf(context, 'action.rejected')).toEqual([]);
  const owl = () => context.store.getState().pets.owl.behaviour;
  for (let i = 0; i < 1000 && !(owl().phase === 'using' && owl().verb === 'perch'); i++) tick();
  env.scene.update(0, 0);
  return { ...env, owl };
};

describe('core §6.4 Owl room entry (WORK-023-2, real content)', () => {
  it('core §6.4 Owl room entry — greeting after greetingDelayMs, intro with the Owl speaker, first want activated', async () => {
    const { context, scene, tick, root } = await enterOwlRoom();
    expect(linesOf(context, 'scene.changed').at(-1)).toMatchObject({ to: { kind: 'interior', roomId: 'owl-room' } });
    expect(scene.pet!.petId).toBe('owl');
    let ms = 0;
    while (ms < 3000 && !linesOf(context, 'pet.reacted').some(l => l.reaction === 'greeting')) { tick(); ms += tickMs; }
    expect(ms).toBeGreaterThanOrEqual(owlContent.tuning.greetingDelayMs);
    expect(linesOf(context, 'pet.reacted').find(l => l.reaction === 'greeting')).toMatchObject({ petId: 'owl', reaction: 'greeting' });
    expect((linesOf(context, 'dialogue.opened')[0].script as { source: string }).source).toBe('intro');
    const script = context.store.getState().dialogue.current!;
    expect([script.source, script.speaker]).toEqual(['intro', { petId: 'owl' }]);
    const box = root.querySelector<HTMLElement>('.tpp-dialogue')!;
    expect(box.hidden).toBe(false);
    expect(box.querySelector('.tpp-portrait img[data-asset-id="pets/owl-portrait"]')).not.toBeNull();
    expect(box.querySelector('.tpp-speaker')!.textContent).toBe(owlContent.pets.owl.name);
    expect(linesOf(context, 'want.activated')[0]).toMatchObject({ petId: 'owl', wantId: owlContent.pets.owl.wants[0].id });
    expect(root.querySelector<HTMLElement>('.tpp-wantPanel')!.hidden).toBe(false);
    expect(linesOf(context, 'action.rejected')).toEqual([]);
  });

  it('VERIFY-MEC-007-016 (Owl) / gate fork Q-A — the first owned tall type (bookshelf, wall-1) is used with perch and plays pet-owl-use-perch; no seat: the Owl stays at the anchor', async () => {
    const firstTall = owlContent.charms.types.find(t => t.tags.includes('tall') && t.sizeClass === 'wall')!;
    const { scene, owl, context } = await perchOn('wall-1', firstTall.id);
    expect([firstTall.id, firstTall.seat]).toEqual(['bookshelf', undefined]);
    expect([owl().phase, owl().verb]).toEqual(['using', 'perch']);
    expect(scene.pet!.anims.currentAnim?.key).toBe('pet-owl-use-perch');
    const anchor = owlContent.rooms['owl-room'].slots.find(s => s.id === 'wall-1')!.anchor;
    expect([scene.pet!.x, scene.pet!.y]).toEqual([anchor.x, anchor.y]);
    expect(linesOf(context, 'action.rejected')).toEqual([]);
  });

  it('VERIFY-MEC-007-016 (Owl) — perch-branch (seat 64, WORK-024-2) at wall-2 lifts the Owl onto the seat above the charm while it perches', async () => {
    const { scene, owl } = await perchOn('wall-2', 'perch-branch');
    const slot = owlContent.rooms['owl-room'].slots.find(s => s.id === 'wall-2')!;
    const seat = owlContent.charms.types.find(t => t.id === 'perch-branch')!.seat!;
    expect([owl().phase, owl().verb, scene.pet!.anims.currentAnim?.key]).toEqual(['using', 'perch', 'pet-owl-use-perch']);
    expect([scene.pet!.x, scene.pet!.y, scene.pet!.depth]).toEqual([slot.x, slot.y - seat.y, (slot.depthOverride ?? slot.y) + 1]);
    expect(scene.pet!.depth).toBeGreaterThan(scene.charms.get('wall-2')!.depth);
  });
});
