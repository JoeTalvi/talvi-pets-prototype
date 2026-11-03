import type { GameState } from '@sim/state';
import { hudProjectId, playerSpace, revealProjectId, starsOfSpace } from '@sim/select';
import type { ViewContext } from '@view/context';
import { hudStreet } from './templates/hudStreet';
import { hudInterior } from './templates/hudInterior';
import { clearStarsBursts, createStarsFill, type Point, type StarsFill } from '@view/celebration/starsBurst';

/** WORK-038-3: mirrors `StreetScene.SITE_SLOT_AT` (the ui layer does not import scenes). */
const SITE_SLOT_AT = 'tpp:siteSlotAt';
import { ROUNDUP_COINS } from './toast';
import { ROUNDUP } from '@view/celebration/timings';
/** DEC-049 §1: the coins' landing tick, −5 st at volume 0.35 (beat text, order fork (d)). */
export const COIN_TICK = { semitones: -5, volume: 0.35 } as const;
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

/** Presentation §8.2 / package fixed decision: the events-arm bar nudge. */
export const BAR_NUDGE_MS = 300;
const CHUNKS = 5;
/** Mec-002 §3.3 re-render list plus presentation §8.2 (`scene.changed`, `celebration.*`); `roundup.fired` nudges separately. */
const RENDER_ON = ['phase.reached', 'feed.stopped', 'debug.applied', 'state.reset', 'rewards.collected', 'completeNow.taken',
  'scene.changed', 'celebration.started', 'celebration.ended',
  // WORK-034-3: the site's Decorate and Stars (presentation §8.2 `hudStreet`, DEC-044, gate fork 11).
  'space.unlocked', 'space.stars.changed', 'mode.changed', 'stars.visibilityChanged', 'dialogue.opened', 'dialogue.closed',
  'arrival.started', 'arrival.finished', 'space.arrivalStarted'] as const;

export type HudStreet = Panel & { render(): void };

/** Mec-002 §3.3: chunk `i` fill `clamp((current − i·goal/5) / (goal/5), 0, 1)`, as a percentage. */
export function chunkFills(currentCents: number, goalCents: number): number[] {
  const step = goalCents / CHUNKS;
  // Scaled before the division so whole-cent fractions stay exact (0.2 × 100 is 20.000000000000004).
  return Array.from({ length: CHUNKS }, (_, i) => Math.min(100, Math.max(0, (currentCents - i * step) * 100 / step)));
}

export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

type Site = { pill: HTMLElement; stars: HTMLElement; starsLabel: HTMLElement; fill: HTMLElement; toggle: HTMLButtonElement; label: HTMLElement };
type Parts = { section: HTMLElement; name: HTMLElement; amount: HTMLElement; fills: HTMLElement[]; reveal: HTMLButtonElement; site: Site };

/** The site Stars pill and the Decorate/Done control, taken from the interior HUD's template so they share its treatment; the
 * pill sits under the street bar (no Hearts: the site has no resident Hearts row). */
function siteParts(section: HTMLElement, options: Parameters<typeof hudInterior>[0]): Site {
  const scratch = document.createElement('div');
  scratch.innerHTML = hudInterior({ ...options, idPrefix: 'hud-street-site' });
  const pill = scratch.querySelector<HTMLElement>('.tpp-interior-pill')!;
  pill.querySelector('.tpp-hearts')?.remove();
  pill.classList.add('tpp-site-pill'); pill.style.top = '120px'; pill.style.width = '600px';
  const toggle = scratch.querySelector<HTMLButtonElement>('.tpp-design-toggle')!;
  toggle.classList.add('tpp-site-toggle');
  section.querySelector('.tpp-debug-entry')!.before(pill, toggle);
  const stars = pill.querySelector<HTMLElement>('.tpp-stars')!;
  return { pill, stars, starsLabel: stars.querySelector<HTMLElement>('[data-string-key="tpp.stars.label"]')!,
    fill: stars.querySelector<HTMLElement>('.tpp-stars-track i')!, toggle, label: toggle.querySelector<HTMLElement>('[data-string-key]')! };
}

/** WORK-034-3: "More homes coming" is retired (interim contract, `feed.stopped` wording without it); the module no longer builds it. */
function partsOf(section: HTMLElement, options: Parameters<typeof hudInterior>[0]): Parts {
  const [name, amount] = [...section.querySelectorAll<HTMLElement>('.tpp-project-label > span')];
  const reveal = section.querySelector<HTMLButtonElement>('.tpp-reveal-link')!;
  return { section, name, amount, reveal, fills: [...section.querySelectorAll<HTMLElement>('.tpp-chunks b')], site: siteParts(section, options) };
}

/** DEC-044 / gate fork 11: once a site is unlocked, Decorate/Done and the site's Stars ("n / max ★", the interior bar's template),
 * hidden while locked; the Stars also hide with TEST-001 off (MEC-006 R7). Decorate is disabled while a dialogue, an arrival or a
 * site arrival is open (the sim rejects it then); Done stays usable. */
function renderSite(site: Site, context: ViewContext, text: Text, state: GameState, pendingStars: number): void {
  const ref = playerSpace(context.content, state);
  site.toggle.hidden = ref === null;
  site.pill.hidden = ref === null || !state.session.starsVisible;
  if (ref === null) return;
  const design = state.mode === 'design';
  const key = design ? 'tpp.hud.done' : 'tpp.hud.decorate';
  site.label.dataset.stringKey = key; site.label.textContent = text(key);
  site.toggle.classList.toggle('ns-btn-primary', !design); site.toggle.classList.toggle('ns-btn-secondary', design);
  site.toggle.disabled = !design && (state.dialogue.current !== null || state.arrival !== null || state.siteArrival !== null);
  const { points, max } = starsOfSpace(context.content, state, ref);
  site.starsLabel.textContent = text('tpp.stars.label', { stars: points, max });
  const filled = Math.max(0, points - pendingStars);
  site.fill.style.width = `${max > 0 ? Math.min(100, (filled / max) * 100) : 0}%`;
}

/** DEC-049 §4 on the site pill: the same Stars burst as the interior bar, from the placed site slot (else the screen centre). */
function siteBurst(root: HTMLElement, site: Site, fill: StarsFill, context: ViewContext, from: Point | null, delta: number): void {
  fill.gain(root, site.fill.parentElement ?? site.stars, { from: from ?? { x: 960, y: 540 }, delta,
    firstCopy: delta >= context.content.tuning.starsFirstCopy, audio: () => context.audio });
}

/** Writes the bar to `cents` over `ms` (0 = no tween); `dataset.barCents`/`barMs` let HEADLESS tests read target and duration. */
function setBar(p: Parts, cents: number, goal: number, ms: number): void {
  p.section.dataset.barCents = String(cents); p.section.dataset.barMs = String(ms);
  const widths = chunkFills(cents, goal);
  p.fills.forEach((fill, i) => { fill.style.transition = ms > 0 ? `width ${ms}ms linear` : 'none'; fill.style.width = `${widths[i]}%`; });
}

/** Presentation §7.1: `.frozen` (pointer-events none, opacity 0.6) while a celebration is open; the reveal control is disabled. */
function setFrozen(p: Parts, frozen: boolean): void {
  p.section.classList.toggle('frozen', frozen);
  p.section.style.pointerEvents = frozen ? 'none' : '';
  p.section.style.opacity = frozen ? '0.6' : '';
  p.reveal.disabled = frozen;
}

function renderHud(p: Parts, context: ViewContext, text: Text, state: GameState, nudgeMs: number | null, pendingStars = 0, barHeld = false): void {
  const { content } = context;
  p.section.hidden = state.scene.kind !== 'street';
  setFrozen(p, state.celebration !== null);
  if (state.scene.kind === 'street') renderSite(p.site, context, text, state, pendingStars);
  // Order fork 1: the selector verbatim (hidden while the only rising project is at goal but unacknowledged, R1-A1).
  p.reveal.hidden = revealProjectId(content, state) === null;
  const projectId = hudProjectId(content, state);
  const project = content.projects.find(candidate => candidate.id === projectId);
  if (!project) return;
  const cents = state.projects[project.id].currentCents;
  p.name.dataset.stringKey = 'content.project.name'; p.name.textContent = project.name;
  p.amount.textContent = text('tpp.hud.progress', { current: dollars(cents), goal: dollars(project.goalCents) });
  // A same-target re-render (e.g. `debug.applied` after a simulated round-up) keeps the running nudge.
  if (nudgeMs !== null) setBar(p, cents, project.goalCents, nudgeMs);
  // DEC-049 §1: while round-up coins are in flight the bar keeps its width until they land.
  else if (!barHeld && p.section.dataset.barCents !== String(cents)) setBar(p, cents, project.goalCents, 0);
}

type RoundupEvent = { projectId: string; changeCents: number; currentCents: number };
type Nudge = { held(): boolean; onRoundup(event: RoundupEvent, after: GameState): void; clear(): void; destroy(): void };

/** DEC-049 §1: a round-up whose toast shows now launches coins (`ROUNDUP_COINS`); the bar holds its pre-purchase value and the
 * nudge, the glow and the tick wait for the landing. Without coins (a held toast) the nudge starts at the end of the dispatch. */
function roundupNudge(p: Parts, context: ViewContext, render: (state: GameState, nudgeMs: number | null) => void): Nudge {
  const { content, store } = context;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let deciding = false, coinsLand: number | null = null;
  const onCoins = (e: Event) => { coinsLand = (e as CustomEvent<{ landMs: number }>).detail.landMs; };
  window.addEventListener(ROUNDUP_COINS, onCoins);
  const land = () => {
    render(store.getState(), BAR_NUDGE_MS);
    const bar = p.section.querySelector<HTMLElement>('.tpp-chunks');
    bar?.animate?.([{ filter: 'brightness(1)' }, { filter: 'brightness(1.5) drop-shadow(0 0 10px rgba(255, 220, 120, 0.9))' }, { filter: 'brightness(1)' }],
      { duration: ROUNDUP.glowMs });
    if (bar) bar.dataset.glows = String(Number(bar.dataset.glows ?? 0) + 1);
    context.audio?.play('tick', COIN_TICK);
  };
  const clear = () => { for (const t of timers) clearTimeout(t); timers.clear(); coinsLand = null; deciding = false; };
  return {
    held: () => deciding || timers.size > 0,
    clear,
    destroy() { window.removeEventListener(ROUNDUP_COINS, onCoins); clear(); },
    onRoundup(event, after) {
      // A re-render earlier in the same dispatch (`debug.applied`) may already show the new total: hold the pre-purchase value.
      const goal = content.projects.find(pr => pr.id === event.projectId)?.goalCents;
      if (goal && hudProjectId(content, after) === event.projectId) setBar(p, event.currentCents - event.changeCents, goal, 0);
      deciding = true;
      queueMicrotask(() => {
        deciding = false;
        const ms = coinsLand; coinsLand = null;
        if (ms === null) { render(store.getState(), BAR_NUDGE_MS); return; }
        const t = setTimeout(() => { timers.delete(t); land(); }, ms);
        timers.add(t);
      });
    },
  };
}

/** DEC-049 §4: the site pill's Stars burst from the slot the street announced in the same dispatch (`SITE_SLOT_AT`). */
function siteGains(root: HTMLElement, p: Parts, context: ViewContext, fill: StarsFill): { off(): void } {
  const { store } = context;
  let slotAt: Point | null = null;
  const onSlotAt = (e: Event) => { const d = (e as CustomEvent<Point>).detail; slotAt = { x: d.x, y: d.y }; };
  window.addEventListener(SITE_SLOT_AT, onSlotAt);
  // Deferred to the end of the dispatch so the scene's slot point from the same `charm.placed` is known whichever subscriber ran first.
  const off = store.subscribe('space.stars.changed', event => {
    if (event.delta <= 0) return;
    queueMicrotask(() => {
      const state = store.getState();
      const from = slotAt; slotAt = null;
      if (state.scene.kind !== 'street' || !state.session.starsVisible || p.site.pill.hidden) return;
      siteBurst(root, p.site, fill, context, from, event.delta);
    });
  });
  return { off() { off(); window.removeEventListener(SITE_SLOT_AT, onSlotAt); } };
}

/** Presentation §8.2 `hudStreet`: the project bar (nudge / trickle glide), "More homes coming", the reveal icon, `.frozen`; the debug entry and the reveal icon are bound by the debug and reveal panels. */
export function createHudStreet(root: HTMLElement, context: ViewContext): HudStreet {
  const { content, store } = context;
  const text = createText(content.strings);
  const assets = assetsFrom(context.manifest);
  root.insertAdjacentHTML('beforeend', hudStreet({ text, assets, idPrefix: 'hud-street' }));
  const p = partsOf(root.lastElementChild as HTMLElement, { text, assets });
  const onToggle = () => store.dispatch({ type: 'setDesignMode', on: store.getState().mode !== 'design' });
  p.site.toggle.addEventListener('click', onToggle);
  const fill = createStarsFill(() => render(store.getState()));
  const render = (state: GameState, nudgeMs: number | null = null) => renderHud(p, context, text, state, nudgeMs, fill.pending(), nudge.held());
  const nudge = roundupNudge(p, context, render);
  const gains = siteGains(root, p, context, fill);
  const clearBursts = () => { clearStarsBursts(root); fill.release(); };
  const offs = [...RENDER_ON.map(type => store.subscribe(type, (_event, after) => render(after))),
    // VERIFY-MEC-010-015: the trickle arm glides over one feed interval instead of the 300 ms nudge.
    store.subscribe('roundup.fired', (event, after) => {
      if (after.session.feedPresentation === 'trickle') render(after, after.session.eventIntervalMs ?? BAR_NUDGE_MS);
      else nudge.onRoundup(event, after);
    }),
    store.subscribe('stars.visibilityChanged', (_event, after) => { if (!after.session.starsVisible) clearBursts(); }),
    store.subscribe('state.reset', () => { clearBursts(); nudge.clear(); }),
    store.subscribe('scene.changed', clearBursts),
    gains.off, nudge.destroy];
  render(store.getState());
  return {
    render: () => render(store.getState()),
    destroy() { for (const off of offs) off(); p.site.toggle.removeEventListener('click', onToggle); p.section.remove(); clearStarsBursts(root); },
  };
}
