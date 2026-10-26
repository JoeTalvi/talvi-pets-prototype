// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/sim/state';
import type { InteriorScene } from '../../src/view/scenes/InteriorScene';
import { designSetup, linesOf, pointer } from './designHarness';
import { destroyScene } from './sceneHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const ICONS = ['ui/soft', 'ui/seat', 'charms/lamp', 'rooms/fixture'];
const tick = (scene: InteriorScene, n = 1) => { for (let i = 0; i < n; i++) scene.update(0, 100); };
const glyph = (scene: InteriorScene) => scene.bubble!.current()?.text ?? null;
const childType = (scene: InteriorScene) => scene.bubble!.child?.constructor.name ?? null;
const owning = (...ids: string[]) => (s: GameState) => { s.inventory.ownedTypeIds.push(...ids); };
const play = (s: GameState) => { s.mode = 'play'; };
const wantTwo = (s: GameState) => { s.pets.dog.fulfilledWantIds = ['soft-nap']; };

describe('VERIFY-MEC-008-016 bubble classes and lifetimes', () => {
  it('VERIFY-MEC-008-016 partial: jsdom + Chrome (iPhone half not-run (user, play session)) — one Container at depth 8000 + 0 following bubbleAnchor (HEADLESS: keys, child types and size fields, never pixels)', async () => {
    const { scene } = await designSetup({ edit: play });
    const bubble = scene.bubble!;
    expect(bubble.constructor.name).toBe('Bubble');
    expect(bubble.depth).toBe(8000);
    tick(scene, 3);
    expect([bubble.x, bubble.y]).toEqual([scene.pet!.x, scene.pet!.y - 125]);
    expect(bubble.shell.constructor.name).toBe('Graphics');
    expect(readFileSync('src/view/objects/Bubble.ts', 'utf8')).not.toMatch(/NineSlice|lineStyle|strokeEllipse/);
  });

  it('VERIFY-MEC-008-016 partial: jsdom — dislike shows 💢 at once; a love walk-over waits for {to:reacting} then ❤️ for 2000 ms; 😴 nap emote 2000 ms (fork 2)', async () => {
    const { scene, context, state } = await designSetup({ edit: owning('bookshelf') });
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'bookshelf' });
    expect(linesOf(context, 'pet.reacted').at(-1)).toMatchObject({ reaction: 'dislike', walkOver: false });
    expect(glyph(scene)).toBe('💢');
    expect(childType(scene)).toBe('Text');
    context.store.dispatch({ type: 'removeCharm', slotId: 'large-1' });
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(linesOf(context, 'pet.reacted').at(-1)).toMatchObject({ reaction: 'love', walkOver: true });
    expect(glyph(scene)).not.toBe('❤️');
    for (let i = 0; i < 200 && state().pets.dog.behaviour.phase !== 'reacting'; i++) tick(scene);
    expect(glyph(scene)).toBe('❤️');
    tick(scene, 18);
    expect(glyph(scene)).toBe('❤️');
    expect(scene.bubble!.alpha).toBeLessThan(1);
    for (let i = 0; i < 40 && state().pets.dog.behaviour.phase !== 'using'; i++) tick(scene);
    expect(glyph(scene)).toBe('😴');
    tick(scene, 20);
    expect(scene.bubble!.current()).toBeNull();
    expect(scene.bubble!.child).toBeNull();
    expect(scene.bubble!.visible).toBe(false);
  });

});

describe('VERIFY-MEC-008-016 verb end, removal and greeting', () => {
  it('VERIFY-MEC-008-016 partial: jsdom — Q11(a) verb end shows the sim ladder grade ❤️ at once (want 2 active so no vignette opens)', async () => {
    const { scene, context, state } = await designSetup({ edit: wantTwo });
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    let ended = false;
    context.store.subscribe('pet.verbEnded', () => { ended = true; });
    for (let i = 0; i < 600 && !ended; i++) tick(scene);
    expect(ended).toBe(true);
    expect(linesOf(context, 'pet.reacted').at(-1)).toMatchObject({ reaction: 'love', walkOver: false });
    expect(glyph(scene)).toBe('❤️');
    expect(state().dialogue.current).toBeNull();
  });

  it('VERIFY-MEC-008-016 partial: jsdom — removing the charm the Dog is using shows 🤔', async () => {
    const { scene, context } = await designSetup({ edit: s => {
      wantTwo(s);
      s.rooms['dog-room'].placements['large-1'] = 'dog-bed';
      s.pets.dog.behaviour = { ...s.pets.dog.behaviour, phase: 'using', x: 1250, y: 600, facing: 'left', timerMs: 9000, target: { slotId: 'large-1' }, verb: 'nap', reaction: null };
    } });
    context.store.dispatch({ type: 'removeCharm', slotId: 'large-1' });
    expect(linesOf(context, 'pet.reacted').at(-1)).toMatchObject({ reaction: 'interrupted' });
    tick(scene);
    expect(glyph(scene)).toBe('🤔');
  });

  it('VERIFY-MEC-008-016 partial: jsdom — entering the room greets: 🎵 shows on {to:greeting}, not before', async () => {
    const { scene, context, state } = await designSetup({ edit: s => {
      s.mode = 'play'; s.scene = { kind: 'street' };
      s.avatar = { ...s.avatar, x: 200, y: 830, facing: 'up' };
    } });
    for (let i = 0; i < 20 && state().scene.kind === 'street'; i++) context.store.dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: -1 } });
    expect(linesOf(context, 'pet.reacted').at(-1)).toMatchObject({ reaction: 'greeting', walkOver: true });
    expect(glyph(scene)).toBeNull();
    for (let i = 0; i < 300 && state().pets.dog.behaviour.phase !== 'greeting'; i++) context.store.dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: 0 } });
    expect(glyph(scene)).toBe('🎵');
  });
});

describe('VERIFY-MEC-008-016 greeting across the scene change', () => {
  it('VERIFY-MEC-008-016 partial: jsdom — an Interior created mid greeting walk (the reacted event fired on the street) still shows 🎵 on {to:greeting}', async () => {
    const { scene, state } = await designSetup({ edit: s => {
      s.mode = 'play';
      s.pets.dog.behaviour = { phase: 'walking', x: 800, y: 700, facing: 'left', timerMs: 0, target: { wanderPointId: 'w0' }, verb: null, reaction: 'greeting' };
    } });
    expect(glyph(scene)).toBeNull();
    for (let i = 0; i < 300 && state().pets.dog.behaviour.phase !== 'greeting'; i++) tick(scene);
    expect(state().pets.dog.behaviour.phase).toBe('greeting');
    expect(glyph(scene)).toBe('🎵');
    scene.bubble!.tap();
    expect(glyph(scene)).toBe('Hello!');
  });
});

describe('VERIFY-MEC-008-016 want bubble', () => {
  it('VERIFY-MEC-008-016 partial: want bubble — the 40 s countdown shows the tag icon 72×72; tap → tpp.bubble.want text, ui.bubbleTapped once, no tapPet', async () => {
    const { scene, context } = await designSetup({ edit: play, images: ICONS });
    for (let i = 0; i < 400 && !linesOf(context, 'pet.wantBubble').length; i++) tick(scene);
    const [want] = linesOf(context, 'pet.wantBubble');
    expect(['soft', 'seat']).toContain(want.tag);
    const icon = scene.bubble!.child as Phaser.GameObjects.Image;
    expect(icon.constructor.name).toBe('Image');
    expect(icon.texture.key).toBe(`ui/${want.tag}`);
    expect([icon.displayWidth, icon.displayHeight]).toEqual([72, 72]);
    const dispatch = vi.spyOn(context.store, 'dispatch');
    const body = scene.bubble!;
    pointer(scene, body.x + 44, body.y - 114);
    expect(linesOf(context, 'input.tap').at(-1)).toMatchObject({ target: 'bubble:dog' });
    expect(glyph(scene)).toBe(`Something ${want.tag} would be lovely.`); // play-session Q7: the tag name is lower case inside the sentence
    expect(linesOf(context, 'ui.bubbleTapped')).toEqual([{ type: 'ui.bubbleTapped', petId: 'dog', class: 'want' }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('VERIFY-MEC-008-016 partial: want bubble — Q12(a) a hidden-only want shows ❓; tap text tpp.bubble.wantHidden', async () => {
    const { scene, context } = await designSetup({ edit: s => {
      play(s);
      s.pets.dog.fulfilledWantIds = ['soft-nap', 'bright-corner'];
      s.rooms['dog-room'].placements['floor-1'] = 'fern';
      s.inventory.ownedTypeIds.push('fern');
    } });
    for (let i = 0; i < 400 && !linesOf(context, 'pet.wantBubble').length; i++) tick(scene);
    expect(linesOf(context, 'pet.wantBubble')[0]).toMatchObject({ tag: null });
    expect(glyph(scene)).toBe('❓');
    scene.bubble!.tap();
    expect(glyph(scene)).toBe('Watch its reactions.');
  });
});

describe('mec-008 §2.3 tapPet routing', () => {
  it('mec-008 §2.3 tapPet routing — a tap inside the 111 px base-centred square → pet:dog + one tapPet → want icon; the frame margin → world, nothing dispatched', async () => {
    const { scene, context } = await designSetup({ edit: play, images: ICONS });
    const b = context.store.getState().pets.dog.behaviour;
    const dispatch = vi.spyOn(context.store, 'dispatch');
    pointer(scene, b.x + 120, b.y - 240);
    expect(linesOf(context, 'input.tap').at(-1)).toMatchObject({ target: 'world' });
    expect(dispatch).not.toHaveBeenCalled();
    pointer(scene, b.x, b.y - 50);
    expect(linesOf(context, 'input.tap').at(-1)).toMatchObject({ target: 'pet:dog' });
    expect(dispatch.mock.calls).toEqual([[{ type: 'tapPet', petId: 'dog' }]]);
    expect(linesOf(context, 'pet.tapped').at(-1)).toMatchObject({ bubble: { kind: 'want' } });
    expect(childType(scene)).toBe('Image');
  });

  it('mec-008 §2.3 tapPet routing — chatter (every want fulfilled) shows text at once; a second tap within 3000 ms is ignored', async () => {
    const { scene, context } = await designSetup({ edit: s => { play(s); s.pets.dog.fulfilledWantIds = ['soft-nap', 'bright-corner', 'feels-like-home']; } });
    const b = context.store.getState().pets.dog.behaviour;
    pointer(scene, b.x, b.y - 50);
    const tapped = linesOf(context, 'pet.tapped').at(-1)!;
    expect(tapped).toMatchObject({ bubble: { kind: 'chatter' } });
    expect(glyph(scene)).toBe((tapped.bubble as { line: string }).line);
    pointer(scene, scene.bubble!.x + 44, scene.bubble!.y - 114);
    expect(linesOf(context, 'input.tap').at(-1)).toMatchObject({ target: 'bubble:dog' });
    expect(linesOf(context, 'ui.bubbleTapped')).toEqual([]);
  });

  it('mec-008 §2.3 tapPet routing — with a dialogue open the tapPet is rejected dialogueOpen and no bubble appears', async () => {
    const { scene, context } = await designSetup({ edit: s => {
      play(s);
      s.dialogue.current = { source: 'tutorial', speaker: { game: true }, lines: ['Hi.'], index: 0 };
    } });
    const b = context.store.getState().pets.dog.behaviour;
    pointer(scene, b.x, b.y - 50);
    expect(linesOf(context, 'action.rejected').at(-1)).toMatchObject({ reason: 'dialogueOpen' });
    expect(scene.bubble!.current()).toBeNull();
  });
});

describe('play-session Q19: a verb emote tap is logged as its own class', () => {
  it('tapping a verb emote emits bubble.tapped {class: verb}, not chatter', async () => {
    const { scene, context } = await designSetup({ edit: play });
    const verb = context.content.verbs[0];
    scene.bubble!.show({ kind: 'emoji', class: 'verb', glyph: verb.emote, tapText: 'Dog is taking a look.' });
    scene.bubble!.tap();
    expect(linesOf(context, 'ui.bubbleTapped').at(-1)).toMatchObject({ petId: 'dog', class: 'verb' });
  });
});
