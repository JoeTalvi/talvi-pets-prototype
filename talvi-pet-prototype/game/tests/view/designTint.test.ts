// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { initialState } from '../../src/sim/state';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { DESIGN_TINT, OUTLINE_BAND } from '../../src/view/celebration/timings';
import { files } from '../content/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';
import { designSetup } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); });

const overlaySnapshot = (root: HTMLElement) => [root, ...root.querySelectorAll<HTMLElement>('*')]
  .filter(el => !el.closest('[data-panel="dialogue"]'))
  .map(el => [el.getAttribute('style') ?? '', el.style.filter, getComputedStyle(el).filter].join('|'));

describe('VERIFY-WORK-032-2-01 design-mode tint (WORK-032-2 fix 4)', () => {
  it('VERIFY-WORK-032-2-01: interior tint visible iff design, colour/alpha from DESIGN_TINT, camera-fixed, above world sprites and below the outlines', async () => {
    const { scene, context } = await designSetup({ mode: 'play' });
    const rect = scene.designTint.rect;
    expect([rect.visible, rect.fillColor, rect.alpha, rect.depth, rect.scrollFactorX, rect.scrollFactorY]).toEqual([false, DESIGN_TINT.color, DESIGN_TINT.alpha, DESIGN_TINT.depth, 0, 0]);
    expect([rect.width, rect.height]).toEqual([scene.scale.gameSize.width, scene.scale.gameSize.height]);
    context.store.dispatch({ type: 'setDesignMode', on: true });
    expect(rect.visible).toBe(true);
    const worldDepths = [...scene.charms.values(), scene.pet!, scene.avatar].map(o => o.depth);
    expect(Math.max(...worldDepths)).toBeLessThan(rect.depth);
    const outlineDepths = [...scene.outlines.values()].flatMap(o => [o.depth, o.label.depth]);
    expect(Math.min(...outlineDepths)).toBeGreaterThan(rect.depth);
    expect(scene.outlines.get('floor-3')!.depth).toBe(OUTLINE_BAND + 449.5);
    context.store.dispatch({ type: 'setDesignMode', on: false });
    expect(rect.visible).toBe(false);
  });

  it('VERIFY-WORK-032-2-01: a scene created with state.mode === "design" (reload / restart) shows the tint at once', async () => {
    const { scene } = await designSetup({ mode: 'design' });
    expect(scene.designTint.on).toBe(true);
  });

  it('VERIFY-WORK-032-2-01: the tint follows a Scale resize', async () => {
    const { scene } = await designSetup({ mode: 'design' });
    scene.scale.emit('resize', { width: 1920, height: 900 });
    expect([scene.designTint.rect.width, scene.designTint.rect.height]).toEqual([1920, 900]);
  });

  it('VERIFY-WORK-032-2-01: StreetScene inherits the hook — the tint exists, hidden (no street design mode yet), and syncDesignTint drives it', async () => {
    const content = loadContent(undefined, files());
    const context = contextFor(content, initialState(content, 1));
    const scene = await bootScene(StreetScene, context, {}, ['houses/fixture']);
    expect([scene.designTint.rect.visible, scene.designTint.rect.depth]).toEqual([false, DESIGN_TINT.depth]);
    scene.syncDesignTint({ mode: 'design' });
    expect(scene.designTint.on).toBe(true);
    scene.syncDesignTint({ mode: 'play' });
    expect(scene.designTint.on).toBe(false);
  });
});

describe('VERIFY-WORK-032-2-02 the HTML overlay is not tinted', () => {
  it('VERIFY-WORK-032-2-02: the overlay root and every HUD/panel element keep their style and computed filter across mode.changed {design}; only the existing HUD re-render changes', async () => {
    const { root, context } = await designSetup({ mode: 'play' });
    const host = root.parentElement!;
    const before = { host: host.getAttribute('style'), cls: host.className, filter: getComputedStyle(host).filter, panels: root.getAttribute('style') };
    const snap = overlaySnapshot(root);
    context.store.dispatch({ type: 'setDesignMode', on: true });
    expect({ host: host.getAttribute('style'), cls: host.className, filter: getComputedStyle(host).filter, panels: root.getAttribute('style') }).toEqual(before);
    expect(overlaySnapshot(root)).toEqual(snap);
    expect(root.querySelector('.tpp-hudInterior')!.classList.contains('dim')).toBe(true);
  });
});
