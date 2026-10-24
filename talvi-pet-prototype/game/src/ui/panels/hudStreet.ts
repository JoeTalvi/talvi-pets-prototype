import type { GameState } from '@sim/state';
import { activeProjectId, hudProjectId, revealProjectId } from '@sim/select';
import type { ViewContext } from '@view/context';
import { hudStreet } from './templates/hudStreet';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

/** Presentation §8.2 / package fixed decision: the events-arm bar nudge. */
export const BAR_NUDGE_MS = 300;
const CHUNKS = 5;
/** Mec-002 §3.3 re-render list plus presentation §8.2 (`scene.changed`, `celebration.*`); `roundup.fired` nudges separately. */
const RENDER_ON = ['phase.reached', 'feed.stopped', 'debug.applied', 'state.reset', 'rewards.collected', 'completeNow.taken',
  'scene.changed', 'celebration.started', 'celebration.ended'] as const;

export type HudStreet = Panel & { render(): void };

/** Mec-002 §3.3: chunk `i` fill `clamp((current − i·goal/5) / (goal/5), 0, 1)`, as a percentage. */
export function chunkFills(currentCents: number, goalCents: number): number[] {
  const step = goalCents / CHUNKS;
  // Scaled before the division so whole-cent fractions stay exact (0.2 × 100 is 20.000000000000004).
  return Array.from({ length: CHUNKS }, (_, i) => Math.min(100, Math.max(0, (currentCents - i * step) * 100 / step)));
}

export const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

type Parts = { section: HTMLElement; name: HTMLElement; amount: HTMLElement; fills: HTMLElement[]; moreHomes: HTMLElement; reveal: HTMLButtonElement };

/** "More homes coming" renders only in the template's preview state, so the module builds it with the template's class (order fork 7). */
function partsOf(section: HTMLElement, text: Text): Parts {
  const [name, amount] = [...section.querySelectorAll<HTMLElement>('.tpp-project-label > span')];
  const reveal = section.querySelector<HTMLButtonElement>('.tpp-reveal-link')!;
  const moreHomes = document.createElement('span');
  moreHomes.className = 'tpp-more-homes'; moreHomes.dataset.stringKey = 'tpp.hud.moreHomes'; moreHomes.textContent = text('tpp.hud.moreHomes');
  reveal.before(moreHomes);
  return { section, name, amount, reveal, moreHomes, fills: [...section.querySelectorAll<HTMLElement>('.tpp-chunks b')] };
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

function renderHud(p: Parts, context: ViewContext, text: Text, state: GameState, nudgeMs: number | null): void {
  const { content } = context;
  p.section.hidden = state.scene.kind !== 'street';
  setFrozen(p, state.celebration !== null);
  p.moreHomes.hidden = activeProjectId(content, state) !== null;
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
  else if (p.section.dataset.barCents !== String(cents)) setBar(p, cents, project.goalCents, 0);
}

/** Presentation §8.2 `hudStreet`: the project bar (nudge / trickle glide), "More homes coming", the reveal stub, `.frozen`; the debug entry is bound by the debug panel. */
export function createHudStreet(root: HTMLElement, context: ViewContext): HudStreet {
  const { content, store, log } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', hudStreet({ text, assets: assetsFrom(context.manifest), idPrefix: 'hud-street' }));
  const p = partsOf(root.lastElementChild as HTMLElement, text);
  const render = (state: GameState, nudgeMs: number | null = null) => renderHud(p, context, text, state, nudgeMs);
  // Mec-003 §1 stub: the reveal panel is M2 (WORK-023), so the tap is recorded and nothing opens.
  const onReveal = () => { if (!p.reveal.disabled) log.record('ui.revealPanel', { open: true }); };
  p.reveal.addEventListener('click', onReveal);
  const offs = [...RENDER_ON.map(type => store.subscribe(type, (_event, after) => render(after))),
    // VERIFY-MEC-010-015: the trickle arm glides over one feed interval instead of the 300 ms nudge.
    store.subscribe('roundup.fired', (_event, after) => render(after,
      after.session.feedPresentation === 'trickle' ? after.session.eventIntervalMs ?? BAR_NUDGE_MS : BAR_NUDGE_MS))];
  render(store.getState());
  return {
    render: () => render(store.getState()),
    destroy() { for (const off of offs) off(); p.reveal.removeEventListener('click', onReveal); p.section.remove(); },
  };
}
