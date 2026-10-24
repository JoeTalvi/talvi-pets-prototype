// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { designSetup } from './designHarness';
import { destroyScene } from './sceneHarness';

/** dogLikesLight() (inherited WORK-003-3 FLAG) as a designSetup patch: content-min likes plus light 1. */
const LIKES_LIGHT = [{ tag: 'soft', weight: 3 }, { tag: 'seat', weight: 2 }, { tag: 'toy', weight: 2, hidden: true }, { tag: 'light', weight: 1 }];

afterEach(() => { destroyScene(); document.body.replaceChildren(); });

type Frame = { phase: string; anim: string | undefined; x: number; y: number; flipX: boolean; facing: string; depth: number };

describe('VERIFY-MEC-007-016 PetSprite clips, facing and depth through the real phases', () => {
  it('VERIFY-MEC-007-016 partial: jsdom + Chrome state read (iPhone half not-run (user, play session)) — dog-bed at large-1: walk + flipX + depth = y, react on love, use-lie at the anchor facing left', async () => {
    const { scene, context, state } = await designSetup();
    const phases: { to: string; reaction: string | null; verb: string | null; anim?: string }[] = [];
    context.store.subscribe('pet.phaseChanged', e => { phases.push({ to: e.to, reaction: e.reaction, verb: e.verb, anim: scene.pet!.anims.currentAnim?.key }); });
    const reacted: SimEvent[] = [];
    context.store.subscribe('pet.reacted', e => { reacted.push(e); });
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(reacted[0]).toMatchObject({ reaction: 'love', walkOver: true, slotId: 'large-1' });
    expect(state().pets.dog.behaviour.phase).toBe('walking');
    const walk: Frame[] = [];
    for (let i = 0; i < 200 && state().pets.dog.behaviour.phase === 'walking'; i++) {
      scene.update(0, 100);
      const b = state().pets.dog.behaviour, pet = scene.pet!;
      if (b.phase === 'walking') walk.push({ phase: b.phase, anim: pet.anims.currentAnim?.key, x: pet.x, y: pet.y, flipX: pet.flipX, facing: b.facing, depth: pet.depth });
    }
    expect(walk.length).toBeGreaterThan(3);
    for (const f of walk) {
      expect(f.anim).toBe('pet-dog-walk');
      expect(f.flipX).toBe(f.facing === 'left');
      expect(f.depth).toBe(f.y);
    }
    expect(phases.find(p => p.to === 'reacting')).toMatchObject({ reaction: 'love', anim: 'pet-dog-react' });
    for (let i = 0; i < 40 && state().pets.dog.behaviour.phase !== 'using'; i++) scene.update(0, 100);
    expect(phases.find(p => p.to === 'using')).toMatchObject({ verb: 'nap', anim: 'pet-dog-use-lie' });
    const b = state().pets.dog.behaviour;
    expect([b.x, b.y, b.facing]).toEqual([1250, 600, 'left']);
    expect([scene.pet!.x, scene.pet!.y, scene.pet!.flipX]).toEqual([1250, 600, true]);
  });

  it('VERIFY-MEC-007-016 partial: jsdom — reacting with like plays react and a look-at using plays use-look (lamp on dogLikesLight content, inherited FLAG)', async () => {
    const { scene, context, state } = await designSetup({ patches: [{ file: 'pets/dog.json', path: '/likes', value: LIKES_LIGHT }] });
    const anims: Record<string, string | undefined> = {};
    context.store.subscribe('pet.phaseChanged', e => { anims[e.to === 'reacting' ? `reacting:${e.reaction}` : e.to === 'using' ? `using:${e.verb}` : e.to] = scene.pet!.anims.currentAnim?.key; });
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-3', typeId: 'lamp' });
    for (let i = 0; i < 300 && state().pets.dog.behaviour.phase !== 'using'; i++) scene.update(0, 100);
    expect(anims['reacting:like']).toBe('pet-dog-react');
    expect(anims['using:look-at']).toBe('pet-dog-use-look');
  });
});

describe('gate fork 1 draw-above rule', () => {
  it('gate fork 1 draw-above — while using large-1 the pet draws at slot y + 1 (551) though behaviour.y is 600; back to depth = y after the verb', async () => {
    const { scene, context, state } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    for (let i = 0; i < 300 && state().pets.dog.behaviour.phase !== 'using'; i++) scene.update(0, 100);
    expect(state().pets.dog.behaviour.y).toBe(600);
    expect(scene.pet!.depth).toBe(551);
    expect(scene.pet!.depth).toBeGreaterThan(scene.charms.get('large-1')!.depth);
    scene.update(0, 100);
    expect(scene.pet!.depth).toBe(551);
    let ended = false;
    context.store.subscribe('pet.verbEnded', () => { ended = true; });
    for (let i = 0; i < 400 && !ended; i++) scene.update(0, 100);
    expect(ended).toBe(true);
    scene.update(0, 100);
    expect(scene.pet!.depth).toBe(state().pets.dog.behaviour.y);
  });

  it('gate fork 1 draw-above — a small slot gets no override; a reload mid-using at large-1 applies the override at create', async () => {
    const small = await designSetup({ edit: s => {
      s.rooms['dog-room'].placements['floor-3'] = 'stool';
      s.pets.dog.behaviour = { ...s.pets.dog.behaviour, phase: 'using', x: 460, y: 480, facing: 'left', timerMs: 9000, target: { slotId: 'floor-3' }, verb: 'nap', reaction: null };
    } });
    expect(small.scene.pet!.depth).toBe(480);
    destroyScene(); document.body.replaceChildren();
    const large = await designSetup({ edit: s => {
      s.rooms['dog-room'].placements['large-1'] = 'dog-bed';
      s.pets.dog.behaviour = { ...s.pets.dog.behaviour, phase: 'using', x: 1250, y: 600, facing: 'left', timerMs: 9000, target: { slotId: 'large-1' }, verb: 'nap', reaction: null };
    } });
    expect(large.scene.pet!.depth).toBe(551);
    expect(large.scene.pet!.anims.currentAnim?.key).toBe('pet-dog-use-lie');
  });
});

