// @vitest-environment jsdom
import '../view/setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import realStrings from '../../src/content/strings.json';
import type { DialogueScript } from '../../src/sim/state';
import { createText } from '../../src/ui/overlay';
import { cropBox, opaqueBounds } from '../../src/ui/panels/chooser';
import { sheetPosition } from '../../src/ui/panels/replaceRemove';
import { designSetup, linesOf } from '../view/designHarness';
import { destroyScene } from '../view/sceneHarness';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const css = readFileSync('src/ui/styles/panels.css', 'utf8');

describe('M1 play-session verdicts (2026-10-26): styles and strings', () => {
  it('Q5 / B-5: reveal popup clue rows are 90 px and the clue region 270 px (three two-line cards end at y 694, above Continue at 696)', () => {
    expect(css).toContain('.tpp-popup-clues{height:270px;');
    expect(css).toContain('.tpp-popup-clues .tpp-clue{height:90px}');
    expect(css).not.toMatch(/height:252px|\.tpp-clue\{height:84px\}/);
  });

  it('Q8(b): one "{sign}{amount} ★" pattern for gain and loss (U+2212 for loss); no separate loss key', () => {
    const text = createText(realStrings as Record<string, string>);
    expect([text('tpp.stars.delta', { sign: '+', amount: 4 }), text('tpp.stars.delta', { sign: '−', amount: 4 })]).toEqual(['+4 ★', '−4 ★']);
    expect(realStrings).not.toHaveProperty(['tpp.stars.deltaLoss']);
  });

  it('Q8(b): a loss delta reads from tpp.stars.delta with the same template as a gain', async () => {
    const { root, context } = await designSetup();
    vi.useFakeTimers();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    vi.advanceTimersByTime(1000);
    context.store.dispatch({ type: 'removeCharm', slotId: 'floor-1' });
    const loss = root.querySelector<HTMLElement>('.tpp-stars-delta')!;
    expect([loss.dataset.stringKey, loss.textContent]).toEqual(['tpp.stars.delta', '−4 ★']);
  });

  it('Q12: in Decorate mode the floating Stars delta is not under any dimmed ancestor', async () => {
    const { root, context } = await designSetup({ mode: 'design' });
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    const delta = root.querySelector<HTMLElement>('.tpp-stars-delta')!;
    expect(root.querySelector('.tpp-hudInterior')!.classList.contains('dim')).toBe(true);
    for (let el: HTMLElement | null = delta; el; el = el.parentElement) expect(getComputedStyle(el).opacity || '1').toBe('1');
    expect(getComputedStyle(root.querySelector('.tpp-hearts')!).opacity).toBe('0.45');
    style.remove();
  });

});

describe('M1 play-session verdicts (2026-10-26): panels', () => {
  it('Q9: opaqueBounds finds the alpha bounds; cropBox scales them to fit the card box, centred', () => {
    const w = 10, h = 8, data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[3, 2], [6, 5]]) data[(y * w + x) * 4 + 3] = 255;
    expect(opaqueBounds(data, w, h)).toEqual({ x: 3, y: 2, w: 4, h: 4 });
    expect(opaqueBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
    // 40×20 object in a 160×192 canvas into the 160×140 card box: scale 4, image 640×768, object centred.
    expect(cropBox({ x: 60, y: 150, w: 40, h: 20 }, { w: 160, h: 192 }, { w: 160, h: 140 }))
      .toEqual({ width: 640, height: 768, left: -240, top: -570 });
  });

  it('Q10 (mec-008 §2.1): the dialogue box moves to the top when the resident pet would be under it, and stays at the bottom otherwise', async () => {
    const script: DialogueScript = { source: 'intro', speaker: { petId: 'dog' }, lines: ['Zzz.'], index: 0 };
    const low = await designSetup({ edit: st => { st.dialogue.current = { ...script }; st.pets.dog.behaviour.y = 900; } });
    expect(low.root.querySelector('.tpp-dialogue')!.classList.contains('at-top')).toBe(true);
    destroyScene(); document.body.replaceChildren();
    const high = await designSetup({ edit: st => { st.dialogue.current = { ...script }; st.pets.dog.behaviour.y = 700; } });
    expect(high.root.querySelector('.tpp-dialogue')!.classList.contains('at-top')).toBe(false);
  });

  it('Q14(a): at most the latest 2 round-ups are held while a dialogue is open; they drain in order after it closes', async () => {
    const s = await designSetup({ mode: 'play', edit: st => { st.session.orientationShown = false; } });
    s.context.store.dispatch({ type: 'debugSetEventInterval', ms: 250 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.context.store.dispatch({ type: 'tick', dtMs: 0, move: { x: 0, y: 0 } });
    expect(s.state().dialogue.current).not.toBeNull();
    for (let i = 0; i < 800 && linesOf(s.context, 'roundup.fired').length < 4; i++) s.context.store.dispatch({ type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });
    const fired = linesOf(s.context, 'roundup.fired');
    expect(fired).toHaveLength(4);
    expect(s.panels.toast.queued()).toBe(2);
    for (let i = 0; i < 10 && s.state().dialogue.current !== null; i++) s.context.store.dispatch({ type: 'advanceDialogue' });
    const line = () => s.root.querySelector('.tpp-toast [data-string-key="tpp.toast.roundup"]')!.textContent;
    expect(line()).toContain(fired[2].merchantName as string);
    vi.advanceTimersByTime(3350);
    expect(line()).toContain(fired[3].merchantName as string);
    expect(s.panels.toast.queued()).toBe(0);
  });

  it('Q15: the Replace/Remove card sits beside the charm (right, else left), bottom at the slot base, on screen at 1080 and 823', () => {
    // floor-3 tall lamp (160 px canvas): right of x 907 + 80 + 24; bottom at y 618.
    expect(sheetPosition({ x: 907, y: 618 }, 1080, 80)).toEqual({ left: 1011, top: 378 });
    // floor-6 near the right edge: flips left of the charm.
    expect(sheetPosition({ x: 1323, y: 780 }, 1080, 80)).toEqual({ left: 599, top: 540 });
    expect(sheetPosition({ x: 1323, y: 780 }, 823, 80)).toEqual({ left: 599, top: 780 - 128.5 - 240 });
    // Never off screen.
    expect(sheetPosition({ x: 100, y: 100 }, 823, 80)).toEqual({ left: 204, top: 16 });
    expect(sheetPosition({ x: 970, y: 1060 }, 823, 160)).toEqual({ left: 1154, top: 823 - 240 - 16 });
  });
});

describe('M1 play-session verdicts (2026-10-26): Done while a story is pending', () => {
  it('Q17: Done stays usable while the want story waits for the nap (box hidden) and is disabled once the box shows', async () => {
    const { root, context } = await designSetup({ mode: 'design' });
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    const toggle = root.querySelector<HTMLButtonElement>('.tpp-design-toggle')!, box = root.querySelector<HTMLElement>('.tpp-dialogue')!;
    expect(context.store.getState().dialogue.current).not.toBeNull();
    expect(box.hidden).toBe(true);
    expect(toggle.disabled).toBe(false);
    box.hidden = false; // the deferral ends (the nap starts) and the box shows
    await Promise.resolve();
    expect(toggle.disabled).toBe(true);
    box.hidden = true;
    await Promise.resolve();
    toggle.click();
    expect(context.store.getState().mode).toBe('play');
  });
});
