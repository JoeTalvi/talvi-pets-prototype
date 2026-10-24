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
import { bootScene, contextFor, destroyScene } from './sceneHarness';

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
