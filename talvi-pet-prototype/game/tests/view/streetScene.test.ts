// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import { attentionVisible } from '../../src/sim/select';
import { StreetScene, type ScenePointer } from '../../src/view/scenes/StreetScene';
import { ATTENTION_DEPTH } from '../../src/view/objects/HouseSprite';
import { PREVIEW_DEPTH } from '../../src/view/preview/layer';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { owing } from '../sim/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';
import { linesOf } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); });

const FX = ['houses/fx-1', 'houses/fx-2', 'houses/fx-3', 'houses/fx-4', 'houses/fx-5', 'houses/fx-6'];
const milestoneState = (content: Content) => (parseSaveValue(content, JSON.parse(fixtureText('save-v1.milestone.json'))) as { state: GameState }).state;
/** FX-CONTENT-MIN with distinct Pet House stage ids (the fixture's six are all `houses/fixture`); never mutates a loaded Content; no manifest, as WORK-003-6 fork 2. */
const fxContent = () => loadContent(undefined, patchFiles(files(), [{ file: 'street.json', path: '/houses/1/stageSprites', value: FX }]));

async function street(content: Content, state: GameState, images: string[] = ['houses/fixture']) {
  const context = contextFor(content, state);
  const scene = await bootScene(StreetScene, context, {}, images);
  scene.cameras.main.emit('camerafadeincomplete');
  return { context, scene };
}

let nextId = 1;
function tapAt(scene: StreetScene, x: number, y: number, { ms = 60, dx = 0 } = {}): void {
  const down: ScenePointer = { id: nextId++, worldX: x, worldY: y, downTime: 1000, upTime: 0 };
  scene.pointerDown(down);
  scene.pointerUp({ ...down, worldX: x + dx, upTime: 1000 + ms });
}
const images = (scene: Phaser.Scene) => scene.children.list.filter(c => c.type === 'Image') as Phaser.GameObjects.Image[];

describe('presentation §4 StreetScene', () => {
  it('presentation §4 StreetScene draws tiles, props and houses from street.json — 16 ground tiles at (x, y) origin (0, 0) depth −1, one HouseSprite per house at base y origin (0.5, 1), no placeholder text or door rects, preview layers kept (HEADLESS: object fields, not pixels)', async () => {
    const content = validContent();
    const { scene } = await street(content, milestoneState(content));
    expect(scene.tiles.map(t => [t.x, t.y, t.originX, t.originY, t.depth])).toEqual(content.street.groundTiles.map(t => [t.x, t.y, 0, 0, -1]));
    expect(scene.tiles).toHaveLength(16);
    expect([...scene.houses.values()].map(h => [h.projectId, h.x, h.y, h.originX, h.originY, h.depth, h.texture.key]))
      .toEqual(content.street.houses.map(h => [h.projectId, h.x, h.y, 0.5, 1, h.y, 'houses/fixture']));
    expect(scene.children.list.some(c => c.type === 'Text' && /placeholder/.test((c as Phaser.GameObjects.Text).text))).toBe(false);
    expect(scene.children.list.filter(c => c.type === 'Rectangle')).toHaveLength(0);
    expect(scene.preview).toBeDefined();
  });

  it('presentation §6.1 props draw at base y with origin (0.5, 1); an absent tile/prop/house texture draws `missing`', async () => {
    const content = loadContent(manifest, patchFiles(files(), [{ file: 'street.json', path: '/props', value: [{ sprite: 'world/grass', x: 900, y: 700 }] }]));
    const { scene } = await street(content, initialState(content, 1), []);
    const prop = images(scene).find(i => i.x === 900 && i.y === 700)!;
    expect([prop.originX, prop.originY, prop.depth, prop.texture.key]).toEqual([0.5, 1, 700, 'missing']);
    expect(new Set(scene.tiles.map(t => t.texture.key))).toEqual(new Set(['missing']));
    expect([...scene.houses.values()].map(h => h.texture.key)).toEqual(['missing', 'missing']);
  });

  it('presentation §6.2 HouseSprite shows stageSprites[select.displayedPhase] — ack 1 → houses/fx-2; FX-SAVE-V1-CEL-milestone (toPhase 4) → houses/fx-5', async () => {
    const content = fxContent();
    const first = await street(content, owing(content, 1, 1260), FX);
    expect(first.scene.houses.get('pet-house')!.texture.key).toBe('houses/fx-2');
    destroyScene();
    const state = milestoneState(validContent());
    const second = await street(content, state, FX);
    expect(state.celebration?.step).toBe('milestone');
    expect(second.scene.houses.get('pet-house')!.texture.key).toBe('houses/fx-5');
  });

  it('presentation §5.3 camera bounds = union of ground tiles — content-min (−960, −540, 3200, 1833) at the 320×213 ASSET-009 size; scroll after create is still (0, (1080 − h) / 2)', async () => {
    const content = validContent();
    const { scene } = await street(content, initialState(content, 1));
    const b = scene.cameras.main.getBounds();
    expect([b.x, b.y, b.width, b.height]).toEqual([-960, -540, 3200, 1833]);
    expect([scene.cameras.main.scrollX, scene.cameras.main.scrollY]).toEqual([0, (1080 - scene.scale.gameSize.height) / 2]);
  });

  it('TOOL-002 street preview geometry layer still draws at depth 10000 above the street art', async () => {
    const content = validContent();
    const context = contextFor(content, initialState(content, 1));
    context.preview = { fill: false, pets: false, geometry: true, segments: false };
    const scene = await bootScene(StreetScene, context, {}, ['houses/fixture']);
    scene.preview.sync();
    expect(scene.children.list.some(c => c.depth === PREVIEW_DEPTH && c.visible)).toBe(true);
  });
});

describe('VERIFY-MEC-002-028 street attention icon and house tap', () => {
  const title = 'VERIFY-MEC-002-028 partial: street part, jsdom (Chrome in work-020-1.mjs; iPhone not-run (user, play session); interior badge is WORK-019-2) — ';

  it(`${title}icon at attentionAnchor depth 6000 iff attentionVisible; never on the Starter House`, async () => {
    const content = validContent();
    const { context, scene } = await street(content, owing(content, 1, 1260));
    const icon = scene.icons.get('pet-house')!;
    expect([icon.x, icon.y, icon.depth, icon.visible]).toEqual([1360, 400, ATTENTION_DEPTH, true]);
    expect(attentionVisible(content, context.store.getState(), 'pet-house')).toBe(true);
    expect(scene.icons.get('starter-house')!.visible).toBe(false);
  });

  it(`${title}a tap on the icon → input.tap {target:'house:pet-house'} then one acknowledgeProject → celebration.started {replay:false, fromPhase 1, toPhase 4}; the icon hides`, async () => {
    const content = validContent();
    const { context, scene } = await street(content, owing(content, 1, 1260));
    tapAt(scene, 1370, 410);
    expect(linesOf(context, 'input.tap')).toEqual([{ type: 'input.tap', x: 1370, y: 410, target: 'house:pet-house' }]);
    expect(linesOf(context, 'celebration.started')).toMatchObject([{ projectId: 'pet-house', replay: false, fromPhase: 1, toPhase: 4 }]);
    expect(linesOf(context, 'action.rejected')).toEqual([]);
    expect(scene.icons.get('pet-house')!.visible).toBe(false);
  });

  it(`${title}a tap inside the Pet House bounds while visible acknowledges; a drag records input.drag only`, async () => {
    const content = validContent();
    const { context, scene } = await street(content, owing(content, 1, 1260));
    tapAt(scene, 1360, 800, { dx: 30 });
    tapAt(scene, 1360, 800, { ms: 400 });
    expect(linesOf(context, 'input.drag').map(l => l.target)).toEqual(['house:pet-house', 'house:pet-house']);
    expect(context.store.getState().celebration).toBeNull();
    tapAt(scene, 1360, 800);
    expect(linesOf(context, 'input.tap').map(l => l.target)).toEqual(['house:pet-house']);
    expect(context.store.getState().celebration).toMatchObject({ projectId: 'pet-house', fromPhase: 1, toPhase: 4 });
  });

  it(`${title}owed 0, celebration set, dialogue open or arrival set → icon hidden, a house tap is 'world' and dispatches nothing; the Starter House tap is 'world'`, async () => {
    const content = validContent();
    const cases: [string, (s: GameState) => void][] = [
      ['owed 0', s => { s.projects['pet-house'].acknowledgedPhase = 4; }],
      ['celebration', s => { Object.assign(s, { celebration: milestoneState(content).celebration }); }],
      ['arrival', s => { s.arrival = { projectId: 'pet-house', petId: 'dog' }; }],
    ];
    for (const [, edit] of cases) {
      const state = owing(content, 1, 1260); edit(state);
      const { context, scene } = await street(content, state);
      expect(scene.icons.get('pet-house')!.visible).toBe(false);
      tapAt(scene, 1360, 800); tapAt(scene, 360, 800);
      expect(linesOf(context, 'input.tap').map(l => l.target)).toEqual(['world', 'world']);
      expect(linesOf(context, 'action.rejected', 'celebration.started')).toEqual([]);
      destroyScene();
    }
  });

  it(`${title}phase.reached while standing on the street (owed 0 → 1) shows the icon and starts nothing`, async () => {
    const content = validContent();
    const { context, scene } = await street(content, owing(content, 0, 290));
    expect(scene.icons.get('pet-house')!.visible).toBe(false);
    context.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 300 });
    expect(linesOf(context, 'phase.reached')).toMatchObject([{ projectId: 'pet-house', phase: 1 }]);
    expect(scene.icons.get('pet-house')!.visible).toBe(true);
    expect(context.store.getState().celebration).toBeNull();
  });
});
