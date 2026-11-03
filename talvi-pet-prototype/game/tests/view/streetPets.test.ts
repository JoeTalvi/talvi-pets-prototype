// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { SimEvent } from '../../src/sim/events';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import { streetPets } from '../../src/sim/select';
import { StreetScene, type ScenePointer } from '../../src/view/scenes/StreetScene';
import { StreetPetLayer } from '../../src/view/scenes/streetPets';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { linesOf } from './designHarness';

beforeEach(() => { directorClock.create = () => ({ now: () => 0, after: () => () => {} }); });
afterEach(() => { destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; });

/** Real content: Dog (Starter House yard), Owl (Pet House yard), the Owl's mate at the garden site. */
const content = loadContent();
const ART = ['world/site-garden-empty', 'world/site-garden-base'];
const SHEETS = ['dog', 'owl', 'owl-mate'].map(id => realManifest.entries.find(e => e.id === `pets/${id}-sheet`)!);
type Syncable = { syncScene(ms: number): void };
const run = (scene: StreetScene, ms: number, step = 10) => { for (let t = 0; t < ms; t += step) (scene as unknown as Syncable).syncScene(Math.min(step, ms - t)); };

async function street(state: GameState) {
  const context = contextFor(content, state);
  context.manifest = realManifest;
  const types: string[] = [], dispatch = context.store.dispatch.bind(context.store);
  context.store.dispatch = action => { types.push(action.type); return dispatch(action); };
  // The scene's store subscriptions, so a test can publish an event the sim would not produce on demand (VERIFY-04).
  const listeners: { type: string; fn: (event: SimEvent, after: GameState) => void }[] = [];
  const subscribe = context.store.subscribe.bind(context.store);
  context.store.subscribe = (type, fn) => { listeners.push({ type, fn: fn as never }); return subscribe(type, fn); };
  const publish = (event: SimEvent) => listeners.filter(l => l.type === event.type).forEach(l => l.fn(event, context.store.getState()));
  const scene = await bootScene(StreetScene, context, {}, ART);
  for (const sheet of SHEETS) addTexture(scene, sheet.id, sheet.px!.w, sheet.px!.h, sheet.frame);
  scene.cameras.main.emit('camerafadeincomplete');
  return { context, scene, types, publish };
}
let nextId = 1;
function tapAt(scene: StreetScene, x: number, y: number): void {
  const down: ScenePointer = { id: nextId++, worldX: x, worldY: y, downTime: 1000, upTime: 0 };
  scene.pointerDown(down);
  scene.pointerUp({ ...down, upTime: 1060 });
}
const drawn = (scene: StreetScene) => [...scene.streetPets.pets.keys()];
const sprites = (scene: StreetScene, petId: string) =>
  scene.children.list.filter(c => c.type === 'Sprite' && (c as { petId?: string }).petId === petId).length;

/** Dog and Owl with one Heart each, the mate arrived (intro dialogue closed), standing on the street: the mate drawn alone. */
async function mateArrived(): Promise<GameState> {
  const start = initialState(content, 1);
  start.pets.dog.hearts = 1; start.pets.owl.hearts = 1;
  const { context, scene } = await street(start);
  context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
  context.store.dispatch({ type: 'debugFillSpace', siteId: 'garden' });
  run(scene, scene.arrival!.plan.finishMs + 20);
  const after = context.store.getState();
  destroyScene();
  return { ...after, dialogue: { current: null, queue: [] } };
}
async function allOut() {
  const booted = await street(await mateArrived());
  booted.context.store.dispatch({ type: 'debugSetPetsOutside', mode: 'all' });
  return booted;
}

describe('VERIFY-WORK-035-2-01 one sprite per street pet, kept equal to streetPets (DEC-045)', () => {
  it('scene start with Dog and Owl outside and the mate arrived → three sprites; pet.outside {dog,false} destroys the Dog sprite and bubble in that dispatch; {owl,true} adds an Owl at its behaviour position', async () => {
    const { context, scene } = await allOut();
    const state = context.store.getState();
    expect(drawn(scene)).toEqual(streetPets(content, state).map(p => p.petId));
    expect(new Set(drawn(scene))).toEqual(new Set(['dog', 'owl', 'owl-mate']));
    const reloaded = context.store.getState();
    destroyScene();
    const again = await street(reloaded);
    expect(new Set(drawn(again.scene))).toEqual(new Set(['dog', 'owl', 'owl-mate']));
    const dog = again.scene.streetPets.pets.get('dog')!;
    again.context.store.dispatch({ type: 'debugSetPetsOutside', mode: 'none' });
    expect(linesOf(again.context, 'pet.outside')).toEqual(expect.arrayContaining([{ type: 'pet.outside', petId: 'dog', outside: false }]));
    expect(drawn(again.scene)).toEqual(['owl-mate']);
    expect([dog.sprite.active, dog.bubble.active]).toEqual([false, false]);
    expect(sprites(again.scene, 'dog')).toBe(0);
    again.context.store.dispatch({ type: 'debugSetPetsOutside', mode: 'all' });
    const owl = again.scene.streetPets.pets.get('owl')!.sprite;
    const behaviour = again.context.store.getState().pets.owl.behaviour;
    expect([owl.x, owl.y]).toEqual([behaviour.x, behaviour.y]);
    expect(['dog', 'owl', 'owl-mate'].map(id => sprites(again.scene, id))).toEqual([1, 1, 1]);
  });

  it('WORK-035-2 A3: the layer has no clear(); each scene start builds a fresh layer and Phaser\'s shutdown destroys the old sprites', async () => {
    expect(Object.getOwnPropertyNames(StreetPetLayer.prototype)).not.toContain('clear');
    const { context, scene } = await allOut();
    const old = scene.streetPets, sprite = old.pets.get('dog')!.sprite;
    const created = new Promise(resolve => scene.events.once('create', resolve));
    scene.scene.restart();
    await created;
    expect(sprite.active).toBe(false);
    expect(scene.streetPets).not.toBe(old);
    expect(drawn(scene)).toEqual(streetPets(content, context.store.getState()).map(p => p.petId));
  });

  it('before the mate\'s arrival no mate sprite (mid-walk); state.reset rebuilds the set', async () => {
    const start = initialState(content, 1);
    const { context, scene } = await street(start);
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    context.store.dispatch({ type: 'debugFillSpace', siteId: 'garden' });
    expect(drawn(scene)).toEqual([]);
    expect(scene.pet).toBeUndefined();
    destroyScene();
    const arrived = await allOut();
    expect(drawn(arrived.scene)).toHaveLength(3);
    arrived.context.store.dispatch({ type: 'reset', seed: 1 });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(drawn(arrived.scene)).toEqual(streetPets(content, arrived.context.store.getState()).map(p => p.petId));
    expect(drawn(arrived.scene)).toEqual([]);
  });
});

describe('VERIFY-WORK-035-2-02 depth by base y; clips per pet', () => {
  it('after sync each sprite\'s depth = its behaviour.y; the Owl at y 948 draws in front of the Pet House (depth 940); pet.phaseChanged {owl, walking} changes only the Owl\'s clip', async () => {
    const { context, scene } = await allOut();
    run(scene, 20);
    const state = context.store.getState();
    for (const [petId, { sprite }] of scene.streetPets.pets) expect(sprite.depth).toBe(state.pets[petId].behaviour.y);
    const owl = scene.streetPets.pets.get('owl')!.sprite;
    expect(owl.y).toBe(948);
    expect(owl.depth).toBeGreaterThan(scene.houses.get('pet-house')!.depth);
    expect(scene.houses.get('pet-house')!.depth).toBe(940);
    const before = Object.fromEntries([...scene.streetPets.pets].map(([id, p]) => [id, p.sprite.anims.currentAnim?.key]));
    scene.streetPets.phaseChanged({ type: 'pet.phaseChanged', petId: 'owl', from: 'idle', to: 'walking', target: null, verb: null, reaction: null });
    const after = Object.fromEntries([...scene.streetPets.pets].map(([id, p]) => [id, p.sprite.anims.currentAnim?.key]));
    expect(after.owl).toBe('pet-owl-walk');
    expect(after.owl).not.toBe(before.owl);
    expect([after.dog, after['owl-mate']]).toEqual([before.dog, before['owl-mate']]);
  });
});

describe('VERIFY-WORK-035-2-03 tap priority: outline → frontmost bubble → frontmost pet → house', () => {
  it('two overlapping pets → the larger base y gets tapPet; a bubble over a pet wins; log targets name the hit pet', async () => {
    const { context, scene, types } = await allOut();
    const dog = scene.streetPets.pets.get('dog')!, owl = scene.streetPets.pets.get('owl')!;
    dog.sprite.sync({ x: 800, y: 940, facing: 'right' });
    owl.sprite.sync({ x: 800, y: 950, facing: 'right' });
    tapAt(scene, 800, 900);
    expect(linesOf(context, 'input.tap').at(-1)).toEqual(expect.objectContaining({ target: 'pet:owl' }));
    expect(types.at(-1)).toBe('tapPet');
    expect(linesOf(context, 'pet.tapped').at(-1)).toEqual(expect.objectContaining({ petId: 'owl' }));
    owl.sprite.sync({ x: 800, y: 930, facing: 'right' });
    tapAt(scene, 800, 900);
    expect(linesOf(context, 'input.tap').at(-1)).toEqual(expect.objectContaining({ target: 'pet:dog' }));
    expect(linesOf(context, 'pet.tapped').at(-1)).toEqual(expect.objectContaining({ petId: 'dog' }));
    // The Dog's bubble now shows above it; a tap on the bubble that also covers the Owl's body goes to the bubble.
    dog.bubble.follow(dog.sprite.bubbleAnchor());
    expect(dog.bubble.visible).toBe(true);
    const at = { x: dog.bubble.x + 40, y: dog.bubble.y - 80 };
    expect(dog.bubble.contains(at.x, at.y)).toBe(true);
    owl.sprite.sync({ x: at.x, y: at.y + 40, facing: 'right' });
    expect(owl.sprite.hitContains(at.x, at.y)).toBe(true);
    const tapsBefore = types.filter(t => t === 'tapPet').length;
    tapAt(scene, at.x, at.y);
    expect(linesOf(context, 'input.tap').at(-1)).toEqual(expect.objectContaining({ target: 'bubble:dog' }));
    expect(types.filter(t => t === 'tapPet').length).toBe(tapsBefore);
  });

});

describe('VERIFY-WORK-035-2-03 tap priority: outlines and houses', () => {
  it('a visible outline wins over a pet; with the house icon visible a pet over it wins, and with no pet the tap acknowledges the house', async () => {
    const { context, scene } = await allOut();
    context.store.dispatch({ type: 'setDesignMode', on: true });
    const outline = [...scene.outlines.values()].find(o => o.visible)!;
    expect(outline).toBeDefined();
    const slot = content.street.sites!.flatMap(site => site.slots).find(candidate => candidate.id === outline.slotId)!;
    const point = { x: slot.x, y: slot.y - 20 };
    scene.streetPets.pets.get('dog')!.sprite.sync({ x: point.x, y: point.y + 40, facing: 'right' });
    expect(scene.streetPets.petAt(point.x, point.y)).toBeDefined();
    tapAt(scene, point.x, point.y);
    expect(linesOf(context, 'input.tap').at(-1)?.target).toBe(`slot:${outline.slotId}`);
    destroyScene();
    const arrived = await mateArrived();
    const owed = { ...arrived, projects: { ...arrived.projects, 'pet-house': { ...arrived.projects['pet-house'], acknowledgedPhase: 1 as const, currentCents: 1260 } } };
    const booted = await street(owed);
    booted.context.store.dispatch({ type: 'debugSetPetsOutside', mode: 'all' });
    const icon = booted.scene.icons.get('pet-house')!;
    expect(icon.visible).toBe(true);
    const owl = booted.scene.streetPets.pets.get('owl')!.sprite;
    owl.sync({ x: icon.x, y: icon.y + 40, facing: 'right' });
    tapAt(booted.scene, icon.x, icon.y);
    expect(linesOf(booted.context, 'input.tap').at(-1)?.target).toBe('pet:owl');
    owl.sync({ x: 200, y: 948, facing: 'right' });
    tapAt(booted.scene, icon.x, icon.y);
    expect(linesOf(booted.context, 'input.tap').at(-1)?.target).toBe('house:pet-house');
    expect(booted.types.at(-1)).toBe('acknowledgeProject');
  });
});

describe('VERIFY-WORK-035-2-04 bubbles routed per pet', () => {
  it('pet.tapped {dog} shows the Dog\'s bubble only; pet.reacted {owl-mate} the mate\'s only', async () => {
    const { context, scene, publish } = await allOut();
    const bubbles = () => Object.fromEntries([...scene.streetPets.pets].map(([id, p]) => [id, p.bubble.current() !== null]));
    expect(bubbles()).toEqual({ dog: false, owl: false, 'owl-mate': false });
    const dog = scene.streetPets.pets.get('dog')!.sprite;
    tapAt(scene, dog.x, dog.y - 40);
    expect(linesOf(context, 'pet.tapped').at(-1)).toEqual(expect.objectContaining({ petId: 'dog' }));
    expect(bubbles()).toEqual({ dog: true, owl: false, 'owl-mate': false });
    scene.streetPets.pets.get('dog')!.bubble.clear();
    const mate = scene.streetPets.pets.get('owl-mate')!.sprite;
    tapAt(scene, mate.x, mate.y - 40);
    expect(linesOf(context, 'pet.tapped').at(-1)).toEqual(expect.objectContaining({ petId: 'owl-mate' }));
    expect(bubbles()).toEqual({ dog: false, owl: false, 'owl-mate': true });
    scene.streetPets.pets.get('owl-mate')!.bubble.clear();
    expect(bubbles()).toEqual({ dog: false, owl: false, 'owl-mate': false });
    publish({ type: 'pet.reacted', petId: 'owl-mate', reaction: 'love', slotId: null, typeId: null, line: null, walkOver: false });
    expect(bubbles()).toEqual({ dog: false, owl: false, 'owl-mate': true });
    // The shared subscriptions (pet.reacted / pet.wantBubble / pet.verbStarted) resolve their bubble through petBubble(petId).
    const seam = (scene as unknown as { petBubble(petId?: string): unknown });
    expect(['dog', 'owl', 'owl-mate'].map(id => seam.petBubble(id))).toEqual(['dog', 'owl', 'owl-mate'].map(id => scene.streetPets.pets.get(id)!.bubble));
    expect(seam.petBubble()).toBeUndefined();
  });
});
