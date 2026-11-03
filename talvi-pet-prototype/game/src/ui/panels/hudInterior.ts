import type { Content } from '@content/types';
import type { GameState } from '@sim/state';
import { hudProjectId, owedPhases, starsOf } from '@sim/select';
import type { ViewContext } from '@view/context';
import { centreIn, clearStarsBursts, starsBurst, worldToOverlay } from '@view/celebration/starsBurst';
import { hudInterior } from './templates/hudInterior';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

const RENDER_ON = ['mode.changed', 'stars.changed', 'stars.visibilityChanged', 'heart.earned', 'dialogue.opened', 'dialogue.closed',
  'scene.changed', 'state.reset', 'charm.placed', 'charm.removed', 'phase.reached', 'celebration.started', 'celebration.ended',
  'rewards.collected', 'debug.applied', 'roundup.fired'] as const;
/** Presentation §8.2 timings: fill tween, floating delta, explanation / badge text. */
export const HUD_TIMING = { tweenMs: 250, deltaMs: 900, deltaRisePx: 40, tooltipMs: 3000, pulseMs: 300 } as const;

/**
 * Q13(a) (mec-002 Q9): inside an interior the badge shows iff a home phase is owed with no celebration or arrival —
 * `select.attentionVisible` is street-only by definition, so this is its rule with the scene clause inverted (order fork 1).
 */
export function interiorAttentionVisible(content: Content, state: GameState): boolean {
  if (state.scene.kind !== 'interior' || state.celebration !== null || state.arrival !== null) return false;
  const projectId = hudProjectId(content, state);
  return projectId !== null && owedPhases(content, state, projectId) > 0;
}

/** A module-built `aside.tpp-stars-explained.ns-tooltip` (template class) shown for `tooltipMs`, replacing any earlier one of its kind. */
function showTooltip(section: HTMLElement, modifier: string, message: string, style: Partial<CSSStyleDeclaration>): HTMLElement {
  section.querySelector(`.tpp-stars-explained.${modifier}`)?.remove();
  const aside = document.createElement('aside');
  aside.className = `tpp-stars-explained ns-tooltip ${modifier}`; aside.textContent = message;
  Object.assign(aside.style, style);
  section.append(aside);
  setTimeout(() => aside.remove(), HUD_TIMING.tooltipMs);
  return aside;
}

/** MEC-006 R5: one `span.tpp-stars-delta` per `stars.changed`, gain olive / loss red (U+2212, fork 3), rising and fading, removed after `deltaMs`; Q8(b): one `{sign}{amount} ★` pattern. */
function floatDelta(stars: HTMLElement, text: Text, delta: number): HTMLElement {
  const el = document.createElement('span');
  el.className = `tpp-stars-delta ${delta < 0 ? 'loss' : 'gain'}`; el.dataset.stringKey = 'tpp.stars.delta';
  el.textContent = text('tpp.stars.delta', { sign: delta < 0 ? '−' : '+', amount: Math.abs(delta) });
  el.style.color = delta < 0 ? 'var(--red)' : 'var(--olive)';
  stars.append(el);
  el.animate?.([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(-${HUD_TIMING.deltaRisePx}px)`, opacity: 0 }],
    { duration: HUD_TIMING.deltaMs, easing: 'ease-out', fill: 'forwards' });
  setTimeout(() => el.remove(), HUD_TIMING.deltaMs);
  return el;
}

/** WORK-032-2 fix 6a: the burst flies from the slot `charm.placed` named in the same dispatch (else the screen centre) into the bar. */
function burstFrom(root: HTMLElement, p: Parts, context: ViewContext, state: GameState, slotId: string | null): void {
  if (state.scene.kind !== 'interior') return;
  const slot = slotId ? context.content.rooms[state.scene.roomId]?.slots.find(s => s.id === slotId) : undefined;
  const height = parseFloat(root.parentElement?.style.height ?? '') || 1080;
  const from = worldToOverlay(slot ? { x: slot.x, y: slot.y - 60 } : { x: 960, y: 540 }, height);
  starsBurst(root, from, centreIn(root, p.fill.parentElement ?? p.stars));
}

function pulse(hearts: HTMLElement): void {
  hearts.dataset.pulses = String(Number(hearts.dataset.pulses ?? 0) + 1);
  hearts.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: HUD_TIMING.pulseMs });
}

function attentionBadge(section: HTMLElement, text: Text): HTMLButtonElement {
  const badge = document.createElement('button');
  badge.type = 'button'; badge.className = 'tpp-attention'; badge.dataset.action = 'attention';
  badge.dataset.stringKey = 'tpp.hud.attention'; badge.setAttribute('aria-label', text('tpp.hud.attention'));
  badge.textContent = '!'; badge.hidden = true;
  section.append(badge);
  return badge;
}

type Parts = { section: HTMLElement; toggle: HTMLButtonElement; label: HTMLElement; stars: HTMLElement; starsLabel: HTMLElement;
  fill: HTMLElement; hearts: HTMLElement; badge: HTMLButtonElement };

function partsOf(section: HTMLElement, text: Text): Parts {
  const toggle = section.querySelector<HTMLButtonElement>('.tpp-design-toggle')!;
  const stars = section.querySelector<HTMLElement>('.tpp-stars')!;
  const fill = stars.querySelector<HTMLElement>('.tpp-stars-track i')!;
  fill.style.transition = `width ${HUD_TIMING.tweenMs}ms ease-out`;
  return { section, toggle, label: toggle.querySelector<HTMLElement>('[data-string-key]')!, stars,
    starsLabel: stars.querySelector<HTMLElement>('[data-string-key="tpp.stars.label"]')!, fill,
    hearts: section.querySelector<HTMLElement>('.tpp-hearts')!, badge: attentionBadge(section, text) };
}

function renderHud(p: Parts, context: ViewContext, text: Text, state: GameState): void {
  const { content } = context;
  p.section.hidden = state.scene.kind !== 'interior';
  p.badge.hidden = !interiorAttentionVisible(content, state);
  if (state.scene.kind !== 'interior') return;
  const design = state.mode === 'design';
  p.section.classList.toggle('dim', design);
  const key = design ? 'tpp.hud.done' : 'tpp.hud.decorate';
  p.label.dataset.stringKey = key; p.label.textContent = text(key);
  p.toggle.classList.toggle('ns-btn-primary', !design); p.toggle.classList.toggle('ns-btn-secondary', design);
  // Play-session Q17: Done is disabled only while the dialogue box is on screen (a deferred want story leaves it usable);
  // Decorate stays disabled for any pending dialogue, which the sim rejects.
  const boxShown = !(p.section.parentElement?.querySelector<HTMLElement>('[data-panel="dialogue"]')?.hidden ?? true);
  p.toggle.disabled = state.dialogue.current !== null && (!design || boxShown);
  const room = content.rooms[state.scene.roomId];
  const { points, max } = starsOf(content, state, room.id);
  // MEC-006 R7: hidden arm hides the bar, label and every delta; Hearts stay (and the want panel keeps its Stars floor, Q8(a)).
  p.stars.hidden = !state.session.starsVisible;
  if (p.stars.hidden) for (const el of p.stars.querySelectorAll('.tpp-stars-delta')) el.remove();
  p.starsLabel.textContent = text('tpp.stars.label', { stars: points, max });
  p.fill.style.width = `${max > 0 ? Math.min(100, (points / max) * 100) : 0}%`;
  p.hearts.textContent = text('tpp.hud.hearts', { hearts: state.pets[room.residentPetId]?.hearts ?? 0 });
}

/** Presentation §8.2 `hudInterior`: Decorate/Done (Q14(b)), the Stars bar (tween, delta, explanation), Hearts and the Q13(a) badge. */
export function createHudInterior(root: HTMLElement, context: ViewContext): Panel {
  const { content, store, log } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', hudInterior({ text, assets: assetsFrom(context.manifest), idPrefix: 'hud' }));
  const p = partsOf(root.lastElementChild as HTMLElement, text);
  const render = (state: GameState) => renderHud(p, context, text, state);
  let placedSlot: string | null = null;
  const onToggle = () => store.dispatch({ type: 'setDesignMode', on: store.getState().mode !== 'design' });
  // MEC-006 R6 / core §3: the record is `ui.starsExplained` (mec-006 spells it `ui.starsTapped`; core wins); R7: not while hidden.
  const onStars = () => {
    if (p.stars.hidden || p.section.hidden) return;
    showTooltip(p.section, 'stars', text('tpp.stars.explain'), {});
    log.record('ui.starsExplained', {});
  };
  // Q13(a) tap-to-text; core §3 names no record for a badge tap, so none is written.
  const onBadge = () => showTooltip(p.section, 'attention', text('tpp.hud.attention'), { left: '600px', top: '110px' });
  p.toggle.addEventListener('click', onToggle); p.stars.addEventListener('click', onStars); p.badge.addEventListener('click', onBadge);
  const offs = [...RENDER_ON.map(type => store.subscribe(type, (_event, after) => render(after))),
    store.subscribe('charm.placed', event => { placedSlot = event.slotId; queueMicrotask(() => { placedSlot = null; }); }),
    store.subscribe('stars.changed', (event, after) => {
      if (after.scene.kind !== 'interior' || event.roomId !== after.scene.roomId || !after.session.starsVisible || event.delta === 0) return;
      floatDelta(p.stars, text, event.delta);
      if (event.delta > 0) burstFrom(root, p, context, after, placedSlot);
    }),
    store.subscribe('stars.visibilityChanged', (_event, after) => { if (!after.session.starsVisible) clearStarsBursts(root); }),
    store.subscribe('state.reset', () => clearStarsBursts(root)),
    store.subscribe('scene.changed', () => clearStarsBursts(root)),
    store.subscribe('heart.earned', () => pulse(p.hearts))];
  // Play-session Q17: the dialogue box shows later than its state change (the want story waits for the nap), so Done's
  // disabled state follows the box itself.
  const boxWatch = new MutationObserver(records => {
    if (records.some(r => (r.target as HTMLElement).dataset?.panel === 'dialogue')) render(store.getState());
  });
  boxWatch.observe(root, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  offs.push(() => boxWatch.disconnect());
  render(store.getState());
  return {
    destroy() {
      for (const off of offs) off();
      p.toggle.removeEventListener('click', onToggle); p.stars.removeEventListener('click', onStars); p.badge.removeEventListener('click', onBadge);
      p.section.remove();
      clearStarsBursts(root);
    },
  };
}
