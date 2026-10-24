// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from './sceneHarness';
import { click, designSetup, linesOf, MERGED_STRING_KEYS, pointer } from './designHarness';
import { createText, FALLBACK_STRINGS } from '../../src/ui/overlay';
import { sheetPosition } from '../../src/ui/panels/replaceRemove';
import realStrings from '../../src/content/strings.json';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;
const cardNames = (root: HTMLElement) => [...root.querySelectorAll('.tpp-chooser .tpp-charm-name')].map(e => e.textContent);
const orientationPending = { edit: (s: { session: { orientationShown: boolean } }) => { s.session.orientationShown = false; } };
const openDialogue = (setup: Awaited<ReturnType<typeof designSetup>>) =>
  setup.context.store.dispatch({ type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });

describe('presentation §8.2 hudInterior', () => {
  it('presentation §8.2 hudInterior — mounted once; Decorate/primary in play, Done/secondary + .dim in design; click dispatches setDesignMode', async () => {
    const { root, context } = await designSetup({ mode: 'play' });
    expect(root.querySelectorAll('.tpp-hudInterior')).toHaveLength(1);
    const hud = q(root, '.tpp-hudInterior'), toggle = q<HTMLButtonElement>(root, '.tpp-design-toggle');
    expect(hud.hidden).toBe(false);
    expect([toggle.textContent, toggle.classList.contains('ns-btn-primary'), hud.classList.contains('dim')]).toEqual(['Decorate', true, false]);
    const dispatch = vi.spyOn(context.store, 'dispatch');
    click(toggle);
    expect(dispatch).toHaveBeenCalledWith({ type: 'setDesignMode', on: true });
    expect([toggle.textContent, toggle.classList.contains('ns-btn-secondary'), toggle.classList.contains('ns-btn-primary'), hud.classList.contains('dim')]).toEqual(['Done', true, false, true]);
    click(toggle);
    expect(context.store.getState().mode).toBe('play');
    expect(toggle.textContent).toBe('Decorate');
  });

  it('presentation §8.2 hudInterior — Stars "0 / 48 ★" then "4 / 48 ★" after placeCharm, hearts "♥ 0", hidden by debugSetStarsVisible', async () => {
    const { root, context } = await designSetup();
    const label = q(root, '.tpp-stars [data-string-key="tpp.stars.label"]');
    expect(label.textContent).toBe('0 / 48 ★');
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(label.textContent).toBe('4 / 48 ★');
    expect(q(root, '.tpp-stars-track i').style.width).toBe(`${(4 / 48) * 100}%`);
    expect(q(root, '.tpp-hearts').textContent).toBe('♥ 0');
    context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    expect(q(root, '.tpp-stars').hidden).toBe(true);
  });

  it('presentation §8.2 hudInterior — toggle disabled while a dialogue is open; the debug entry stays unbound', async () => {
    const setup = await designSetup({ mode: 'play', ...orientationPending });
    const toggle = q<HTMLButtonElement>(setup.root, '.tpp-design-toggle');
    expect(toggle.disabled).toBe(false);
    openDialogue(setup);
    expect(setup.state().dialogue.current).not.toBeNull();
    expect(toggle.disabled).toBe(true);
    const dispatch = vi.spyOn(setup.context.store, 'dispatch');
    click(q(setup.root, '.tpp-debug-entry'));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('VERIFY-MEC-004-009 / VERIFY-MEC-004-010 chooser contents', () => {
  it('VERIFY-MEC-004-009 partial: jsdom half (Chrome half = work-014-2-chooser-open capture; iPhone half not-run (user, play session)) — floor-1 lists Lamp, Stool, Vase in owned order with sprite, name and tag icons, no counts', async () => {
    const { root, context } = await designSetup();
    context.bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false });
    expect(q(root, '.tpp-chooser').hidden).toBe(false);
    expect(cardNames(root)).toEqual(['Lamp', 'Stool', 'Vase']);
    const cards = [...root.querySelectorAll<HTMLElement>('.tpp-chooser .tpp-charm-card')];
    expect(cards.map(c => c.querySelector('[data-asset-id]')!.getAttribute('data-asset-id'))).toEqual(['charms/lamp', 'charms/stool', 'charms/vase']);
    expect(cards[0].querySelector('img[data-asset-id="charms/lamp"]')!.getAttribute('src')).toBe('assets/synthetic/charms/lamp.png');
    const tags = cards.map(c => [...c.querySelectorAll('.tpp-tag')].map(t => [t.querySelector('img')!.getAttribute('data-asset-id'), t.textContent]));
    expect(tags).toEqual([[['ui/light', 'Light']], [['ui/seat', 'Seat']], [['ui/food', 'Food']]]);
    expect(q(root, '.tpp-chooser-title').textContent).toBe('Small floor slot');
    expect(q(root, '.tpp-chooser .tpp-muted').textContent).toBe('3 charms you own');
    expect(cards.some(c => /\d+\s*[×x]/.test(c.textContent ?? ''))).toBe(false);
  });

  it('VERIFY-MEC-004-010 partial: jsdom half — no wall type owned → wall-1 shows tpp.chooser.empty and no card; types.unlocked while open appends', async () => {
    const { root, context } = await designSetup({ edit: s => { s.inventory.ownedTypeIds = ['dog-bed', 'lamp', 'stool', 'vase']; } });
    context.bus.emit({ type: 'slot.tapped', slotId: 'wall-1', filled: false });
    expect(q(root, '.tpp-chooser .tpp-empty').textContent).toBe('Nothing you own fits this spot yet.');
    expect(root.querySelectorAll('.tpp-chooser .tpp-charm-card')).toHaveLength(0);
    context.store.dispatch({ type: 'debugUnlockAllTypes' });
    expect(cardNames(root)).toEqual(['Painting', 'Picture']);
  });

  it('VERIFY-MEC-004-009 partial: jsdom half — a sprite absent from the manifest renders the .tpp-asset-slot placeholder', async () => {
    const { root, context } = await designSetup({ omitAssets: ['charms/lamp'] });
    context.bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false });
    const lamp = root.querySelector('.tpp-chooser .tpp-charm-card')!;
    expect(lamp.querySelector('.tpp-asset-slot[data-asset-id="charms/lamp"]')).not.toBeNull();
    expect(lamp.querySelector('img[data-asset-id^="charms/"]')).toBeNull();
  });
});

/** The MEC-005-013 sequence's records, in log order. */
const FLOW_LINES = [
  { type: 'input.tap', x: 460, y: 450, target: 'world' },
  { type: 'mode.changed', mode: 'design' },
  { type: 'input.tap', x: 460, y: 450, target: 'slot:floor-3' },
  { type: 'ui.chooserOpened', slotId: 'floor-3' },
  { type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-3', typeId: 'lamp', replacedTypeId: null },
  { type: 'ui.chooserClosed', slotId: 'floor-3', reason: 'pick' },
  { type: 'input.tap', x: 460, y: 450, target: 'slot:floor-3' },
  { type: 'ui.sheetOpened', slotId: 'floor-3' },
  { type: 'charm.removed', roomId: 'dog-room', slotId: 'floor-3', typeId: 'lamp', interruptedPetId: null },
  { type: 'ui.sheetClosed', slotId: 'floor-3' },
  { type: 'input.tap', x: 460, y: 450, target: 'slot:floor-3' },
  { type: 'ui.chooserOpened', slotId: 'floor-3' },
  { type: 'ui.chooserClosed', slotId: 'floor-3', reason: 'modeExit' },
  { type: 'mode.changed', mode: 'play' },
    ];

describe('VERIFY-MEC-005-013 design tap flow', () => {
  it('VERIFY-MEC-005-013 partial: jsdom half (Chrome half = work-014-2 capture sequence + design-report.json; iPhone half not-run (user, play session)) — play tap → nothing; design tap → chooser → lamp → sheet → Remove → chooser → Done', async () => {
    const setup = await designSetup({ mode: 'play' });
    const { scene, context, root } = setup;
    pointer(scene, 460, 450);
    expect(q(root, '.tpp-chooser').hidden).toBe(true);
    click(q(root, '.tpp-design-toggle'));
    pointer(scene, 460, 450);
    expect(q(root, '.tpp-chooser').hidden).toBe(false);
    scene.syncOutlines();
    expect(scene.outlines.get('floor-3')!.outlineState).toBe('selected');
    const dispatch = vi.spyOn(context.store, 'dispatch');
    click(root.querySelector('.tpp-charm-card[data-type-id="lamp"]'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'placeCharm', slotId: 'floor-3', typeId: 'lamp' });
    expect(q(root, '.tpp-chooser').hidden).toBe(true);
    scene.syncOutlines();
    expect(scene.outlines.get('floor-3')!.outlineState).toBe('filled');
    const lamp = scene.charms.get('floor-3')!;
    expect([lamp.x, lamp.y, lamp.depth]).toEqual([460, 450, 450]);
    pointer(scene, 460, 450);
    const layer = q(root, '.tpp-replaceRemove').parentElement!;
    expect(layer.hidden).toBe(false);
    expect(q(root, '.tpp-sheet-name').textContent).toBe('Lamp');
    click(q(root, '.tpp-replaceRemove [data-action="remove"]'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeCharm', slotId: 'floor-3' });
    expect(layer.hidden).toBe(true);
    scene.syncOutlines();
    expect(scene.outlines.get('floor-3')!.outlineState).toBe('empty');
    expect(scene.charms.has('floor-3')).toBe(false);
    pointer(scene, 460, 450);
    click(q(root, '.tpp-design-toggle'));
    expect(q(root, '.tpp-chooser').hidden).toBe(true);
    expect([...scene.outlines.values()].some(o => o.visible)).toBe(false);
    expect(linesOf(context, 'input.tap', 'ui.chooserOpened', 'ui.chooserClosed', 'ui.sheetOpened', 'ui.sheetClosed', 'charm.placed', 'charm.removed', 'mode.changed')).toEqual(FLOW_LINES);
  });
});

describe('mec-005 R12 close triggers', () => {
  it('mec-005 R12 close triggers — chooser closes on dialogue.opened (reason dialogue), scene.changed and state.reset; a later placeCharm is rejected dialogueOpen', async () => {
    const setup = await designSetup(orientationPending);
    const { context, root } = setup;
    const chooser = q(root, '.tpp-chooser');
    context.bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false });
    openDialogue(setup);
    expect(chooser.hidden).toBe(true);
    expect(linesOf(context, 'ui.chooserClosed')).toEqual([{ type: 'ui.chooserClosed', slotId: 'floor-1', reason: 'dialogue' }]);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(linesOf(context, 'action.rejected').at(-1)).toMatchObject({ reason: 'dialogueOpen' });
    context.bus.emit({ type: 'slot.tapped', slotId: 'floor-2', filled: false });
    context.store.dispatch({ type: 'reset', seed: 5 });
    expect(chooser.hidden).toBe(true);
    expect(linesOf(context, 'ui.chooserClosed').at(-1)).toEqual({ type: 'ui.chooserClosed', slotId: 'floor-2', reason: 'cancel' });
  });

  it('mec-005 R12 close triggers — the sheet closes on mode exit, dialogue.opened and state.reset with ui.sheetClosed; backdrop and × close it too', async () => {
    const setup = await designSetup({ ...orientationPending, edit: s => { s.session.orientationShown = false; s.rooms['dog-room'].placements['floor-1'] = 'lamp'; } });
    const { context, root } = setup;
    const layer = q(root, '.tpp-replaceRemove').parentElement!;
    const openSheet = () => context.bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: true });
    openSheet(); click(q(root, '.tpp-replaceRemove .tpp-close')); expect(layer.hidden).toBe(true);
    openSheet(); click(layer.querySelector('.tpp-dismiss-backdrop')); expect(layer.hidden).toBe(true);
    openSheet(); openDialogue(setup); expect(layer.hidden).toBe(true);
    openSheet(); context.store.dispatch({ type: 'reset', seed: 5 }); expect(layer.hidden).toBe(true);
    expect(linesOf(context, 'ui.sheetClosed')).toHaveLength(4);
  });

  it('mec-005 R12 close triggers — chooser backdrop → reason cancel; scene.changed closes it', async () => {
    const { context, root } = await designSetup();
    context.bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false });
    click(root.querySelector('.tpp-chooser .tpp-dismiss-backdrop'));
    expect(linesOf(context, 'ui.chooserClosed')).toEqual([{ type: 'ui.chooserClosed', slotId: 'floor-1', reason: 'cancel' }]);
  });
});

describe('mec-005 R8 replace', () => {
  it('mec-005 R8 replace — Replace closes the sheet, opens the chooser for the slot (chooserOpened once), lamp listed; picking lamp replaces without a duplicate sprite', async () => {
    const { context, root, scene } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-3', typeId: 'lamp' });
    pointer(scene, 460, 450);
    click(q(root, '.tpp-replaceRemove [data-action="replace"]'));
    expect(q(root, '.tpp-replaceRemove').parentElement!.hidden).toBe(true);
    expect(q(root, '.tpp-chooser').hidden).toBe(false);
    expect(cardNames(root)).toContain('Lamp');
    click(root.querySelector('.tpp-charm-card[data-type-id="lamp"]'));
    expect(linesOf(context, 'ui.sheetClosed', 'ui.chooserOpened', 'charm.placed').slice(-3)).toEqual([
      { type: 'ui.sheetClosed', slotId: 'floor-3' },
      { type: 'ui.chooserOpened', slotId: 'floor-3' },
      { type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-3', typeId: 'lamp', replacedTypeId: 'lamp' },
    ]);
    expect(linesOf(context, 'ui.chooserOpened')).toHaveLength(1);
    expect(scene.children.list.filter(o => o === scene.charms.get('floor-3') || (o.type === 'Image' && (o as Phaser.GameObjects.Image).texture?.key === 'charms/lamp' && (o as Phaser.GameObjects.Image).alpha === 1))).toHaveLength(1);
  });

  it('mec-005 R8 replace — the sheet sits 24 px above the slot screen point, clamped 16 px inside the overlay', () => {
    expect(sheetPosition({ x: 907, y: 618 }, 1080)).toEqual({ left: 597, top: 354 });
    expect(sheetPosition({ x: 100, y: 100 }, 1080)).toEqual({ left: 16, top: 16 });
    expect(sheetPosition({ x: 1900, y: 618 }, 823)).toEqual({ left: 1284, top: 618 - 128.5 - 264 });
  });
});

describe('presentation §8.2 strings fallback', () => {
  it('presentation §8.2 strings fallback — content first, fallback table second, {param} substitution, [key] when unresolved; after the WORK-021-1 strings merge the fallback table and strings-additions.json are both {} and every merged key resolves from the real strings.json with its lane text', () => {
    const text = createText(realStrings as Record<string, string>);
    expect(FALLBACK_STRINGS).toEqual({});
    const merged: Record<string, string> = {
      'tpp.chooser.slot': '{size} slot', 'tpp.chooser.size.small': 'Small floor', 'tpp.chooser.size.large': 'Large floor', 'tpp.chooser.size.wall': 'Wall',
      'tpp.chooser.count': '{count} charms you own', 'tpp.chooser.scroll': '▸ scroll', 'tpp.common.close': 'Close', 'tpp.hud.hearts': '♥ {hearts}',
      'tpp.want.title': 'WANT', 'tpp.chooser.selected': 'Selected spot', 'tpp.stars.deltaLoss': '−{delta} ★', 'tpp.toast.delta': '+{change}',
      'tpp.hud.progress': '{current} / {goal}', 'tpp.popup.rewards': 'Rewards', 'tpp.reveal.phase': 'Phase {phase}',
    };
    for (const [key, value] of Object.entries(merged)) expect((realStrings as Record<string, string>)[key]).toBe(value);
    expect(Object.keys(merged)).toEqual([...MERGED_STRING_KEYS]);
    expect(createText({})('tpp.common.close')).toBe('[tpp.common.close]');
    expect(text('tpp.hud.decorate')).toBe('Decorate');
    expect(text('tpp.chooser.count', { count: 3 })).toBe('3 charms you own');
    expect(text('tpp.stars.label', { stars: 12, max: 48 })).toBe('12 / 48 ★');
    expect(text('tpp.nope')).toBe('[tpp.nope]');
    for (const key of Object.keys(FALLBACK_STRINGS)) expect(realStrings).not.toHaveProperty([key]);
    const additions = JSON.parse(readFileSync('tests/view/strings-additions.json', 'utf8'));
    expect(additions).toEqual(FALLBACK_STRINGS);
    expect(Object.keys(additions).some(k => /guess/i.test(k))).toBe(false);
  });
});
