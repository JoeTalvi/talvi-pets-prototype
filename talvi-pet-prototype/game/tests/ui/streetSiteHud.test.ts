// @vitest-environment jsdom
import '../view/setup';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import type { Action } from '../../src/sim/actions';
import { mountOverlay } from '../../src/ui/overlay';
import { contextFor, realManifest } from '../view/sceneHarness';

afterEach(() => { document.body.replaceChildren(); });

/** Real content: the garden (6 slots × 4 = 24 ★ max) and the real strings. */
const content = loadContent();

function hud(state: GameState = initialState(content, 1)) {
  const context = contextFor(content, state);
  context.manifest = realManifest;
  const host = document.createElement('div'); document.body.append(host);
  mountOverlay(host, context);
  const section = host.querySelector<HTMLElement>('.tpp-hudStreet')!;
  const toggle = section.querySelector<HTMLButtonElement>('.tpp-site-toggle')!;
  const pill = section.querySelector<HTMLElement>('.tpp-site-pill')!;
  const label = () => pill.querySelector<HTMLElement>('[data-string-key="tpp.stars.label"]')!.textContent;
  const dispatch = (...actions: Action[]) => { for (const a of actions) context.store.dispatch(a); };
  return { context, host, section, toggle, pill, label, dispatch };
}

describe('VERIFY-T2-SITE-102 street HUD: Decorate + site Stars (gate fork 11; DEC-044)', () => {
  it('Decorate and the site Stars hidden while the garden is locked; shown once unlocked, "0 / 24 ★"', () => {
    const h = hud();
    expect([h.toggle.hidden, h.pill.hidden]).toEqual([true, true]);
    h.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    expect([h.toggle.hidden, h.pill.hidden]).toEqual([false, false]);
    expect(h.toggle.textContent).toBe('Decorate');
    expect(h.toggle.classList.contains('tpp-design-toggle')).toBe(true);
    expect(h.label()).toBe('0 / 24 ★');
  });

  it('Decorate toggles design mode on the street (Done back); Stars follow space.stars.changed', () => {
    const h = hud();
    h.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    h.toggle.click();
    expect(h.context.store.getState().mode).toBe('design');
    expect(h.toggle.textContent).toBe('Done');
    const small = content.charms.types.find(t => t.sizeClass === 'small')!.id;
    h.dispatch({ type: 'debugGrantCopies', typeId: small, count: 1 }, { type: 'placeCharm', slotId: 'garden-small-1', typeId: small });
    expect(h.label()).toBe('4 / 24 ★');
    expect(h.pill.querySelector<HTMLElement>('.tpp-stars-track i')!.style.width).toBe(`${(4 / 24) * 100}%`);
    h.toggle.click();
    expect(h.context.store.getState().mode).toBe('play');
    expect(h.toggle.textContent).toBe('Decorate');
  });

  it('the Stars hide with TEST-001 off (debugSetStarsVisible false); the whole HUD hides off the street', () => {
    const h = hud();
    h.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' }, { type: 'debugSetStarsVisible', on: false });
    expect([h.toggle.hidden, h.pill.hidden]).toEqual([false, true]);
    h.dispatch({ type: 'debugSetStarsVisible', on: true });
    expect(h.pill.hidden).toBe(false);
    const interior = { ...h.context.store.getState(), scene: { kind: 'interior' as const, roomId: Object.keys(content.rooms)[0] } };
    const off = hud(interior);
    expect(off.section.hidden).toBe(true);
  });

  it('"More homes coming" is absent', () => {
    const h = hud();
    expect(h.section.querySelector('.tpp-more-homes')).toBeNull();
  });
});

describe('VERIFY-T2-SITE-106 the space reward announcement (toast)', () => {
  it('exactly one toast with the placeholder line on space.unlocked', () => {
    const h = hud();
    h.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    const toasts = [...h.host.querySelectorAll<HTMLElement>('.tpp-toast')].filter(el => !el.hidden);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].dataset.kind).toBe('space');
    expect(toasts[0].querySelector('[data-string-key="tpp.toast.space"]')!.textContent).toBe('A garden plot is open on the street');
  });
});
