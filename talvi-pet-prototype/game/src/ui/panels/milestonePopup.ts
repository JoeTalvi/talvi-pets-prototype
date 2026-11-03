import type { GameState } from '@sim/state';
import { completeNowOffered, completeNowPriceCents } from '@sim/select';
import type { ViewContext } from '@view/context';
import { milestonePopup } from './templates/milestonePopup';
import { escapeHtml, image } from './templates/shared';
import { dollars } from './hudStreet';
import { outfitAssets, outfitCardFace } from './closet';
import { createRewardCard } from '@view/celebration/rewardCard';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';
import { CARD, PHASE } from '@view/celebration/timings';
import { createTickSeq } from '@view/celebration/tickSeq';

/** Presentation §8.2 fade in/out and the §12 no-destination collect fallback (order fork 2). */
export const POPUP_FADE_MS = 200;
/** DEC-049 §2: the Collect stagger is `PHASE.collectStaggerMs` 120 (was 50); each tile then rises `COLLECT.risePx` and fades. */
export const COLLECT = { flashMs: 300, staggerMs: PHASE.collectStaggerMs, holdMs: 500, fadeMs: 200, risePx: 40 } as const;
/** DEC-049 §6: each tile's `reveal` steps up this many semitones per tile (as the §2 clue cards). */
export const TILE_REVEAL_SEMITONES = 2;
/** The 3D flip a reward tile enters with (the `rewardCard` block's keyframes, reused so WORK-037-3's outfit tile matches). */
export const TILE_FLIP_FRAMES: Keyframe[] = [{ transform: 'perspective(800px) rotateY(90deg) scale(1.1)', opacity: 1 },
  { transform: 'perspective(800px) rotateY(0deg) scale(1)', opacity: 1 }];
/** Mec-002 §2.6 live price: the Skip label re-renders on these (and the buttons re-enable). */
const RENDER_ON = ['roundup.fired', 'phase.reached', 'feed.stopped', 'completeNow.shown', 'debug.applied'] as const;

/** Total collecting time for `tiles` icons: the last flash ends, the hold, then the fade. */
export const collectMs = (tiles: number): number => COLLECT.flashMs + COLLECT.staggerMs * Math.max(0, tiles - 1) + COLLECT.holdMs + COLLECT.fadeMs;

export type MilestonePopup = Panel & {
  isOpen(): boolean;
  /** Order fork 3: runs `fn` once the popup is hidden (now when it is not open); dropped on close. */
  afterHidden(fn: () => void): void;
};

type Parts = {
  section: HTMLElement; heading: HTMLElement; congrats: HTMLElement; grid: HTMLElement; skip: HTMLElement; skipAnchor: Node | null;
  skipButton: HTMLButtonElement; skipLabel: HTMLElement; collect: HTMLButtonElement;
};

function partsOf(section: HTMLElement): Parts {
  const skip = section.querySelector<HTMLElement>('.tpp-skip')!;
  const skipButton = skip.querySelector<HTMLButtonElement>('button')!;
  return { section, skip, skipButton, skipAnchor: skip.nextSibling, skipLabel: skipButton.querySelector<HTMLElement>('[data-string-key]')!,
    heading: section.querySelector<HTMLElement>('.tpp-heading')!, congrats: section.querySelector<HTMLElement>('.tpp-congrats')!,
    grid: section.querySelector<HTMLElement>('.tpp-reward-grid')!, collect: section.querySelector<HTMLButtonElement>('.tpp-collect')! };
}

/** Order fork 1: the authored `tpp.popup.skipWait` has no `{price}`, so the view appends ` · $X` when the label lacks it. */
export function skipLabel(text: Text, priceCents: number): string {
  const price = dollars(priceCents);
  const label = text('tpp.popup.skipWait', { price });
  return label.includes(price) ? label : `${label} · ${price}`;
}

const fade = (el: HTMLElement, from: number, to: number, ms: number) => {
  if (typeof el.animate === 'function') el.animate([{ opacity: from }, { opacity: to }], { duration: ms, fill: 'forwards' });
};

/** Mec-002 §3.3 `MilestonePopupView`: strings by `completes`, one tile per `unlockedTypeIds` id in order (order fork 6 placeholder). */
function renderContent(p: Parts, context: ViewContext, text: Text, state: GameState, celebration: NonNullable<GameState['celebration']>): void {
  const config = celebration.completes ? 'complete' : 'progress';
  for (const [el, part] of [[p.heading, 'title'], [p.congrats, 'congrats']] as const) {
    const key = `buildprojects.cutscene.popup.${config}.${part}`;
    el.dataset.stringKey = key; el.textContent = text(key);
  }
  const assets = assetsFrom(context.manifest);
  p.grid.innerHTML = celebration.unlockedTypeIds.map((id, i) => {
    const type = context.content.charms.types.find(t => t.id === id);
    if (!type) throw new Error(`Milestone popup: unknown charm type "${id}"`);
    return `<button type="button" class="ns-tile tpp-reward-tile" data-action="preview" data-item-index="${i}" data-type-id="${escapeHtml(id)}" `
      + `data-string-key="content.charm.name" aria-label="${escapeHtml(type.name)}">${image({ assets }, type.sprite)}${newRibbon(text, state, id)}</button>`;
  }).join('');
  if (celebration.completes) p.skip.remove();
  else if (!p.skip.isConnected) p.section.insertBefore(p.skip, p.skipAnchor);
}

/** DEC-049 §6 "New": the type was never granted before this milestone (no inventory key yet; copies are granted at Collect). */
function newRibbon(text: Text, state: GameState, typeId: string): string {
  if (typeId in state.inventory.counts) return '';
  return `<span class="tpp-reward-card-new" data-string-key="tpp.reward.new">${escapeHtml(text('tpp.reward.new'))}</span>`;
}

/** DEC-049 §6: the tiles flip in `CARD.staggerMs` apart over `CARD.flipMs`, each with `reveal` (+2 st per tile) as it starts. */
function flipInTiles(p: Parts, context: ViewContext, schedule: (ms: number, fn: () => void) => void): void {
  [...p.grid.querySelectorAll<HTMLElement>('.tpp-reward-tile')].forEach((tile, i) => {
    tile.animate?.(TILE_FLIP_FRAMES, { duration: CARD.flipMs, delay: i * CARD.staggerMs, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' });
    const play = () => context.audio?.play('reveal', { semitones: TILE_REVEAL_SEMITONES * i });
    if (i === 0) play(); else schedule(i * CARD.staggerMs, play);
  });
}

/** Outfit tile size: the charm tile's 126 px, so the grid keeps its rhythm. */
export const OUTFIT_TILE_PX = 126;

/**
 * WORK-037-3 (gate Q13(a); spec §6 / §10 "Outfit unlocked"): a completing project with `completionOutfitId` gets an outfit tile
 * after the charm tiles, derived from content (no `celebration` change), "New" always (the set was not held). Integration
 * (review WORK-037-3-1 A4): the tile is a `.tpp-reward-tile`, so `flipInTiles` flips it in its `CARD.staggerMs` slot with that
 * slot's `reveal`; the card face is shown at once and rides the tile's flip.
 */
function addOutfitTile(p: Parts, context: ViewContext, text: Text, celebration: NonNullable<GameState['celebration']>): void {
  const outfitId = celebration.completes ? context.content.projects.find(pr => pr.id === celebration.projectId)?.completionOutfitId : undefined;
  if (!outfitId) return;
  const tile = document.createElement('div');
  tile.className = 'tpp-reward-tile tpp-outfit-tile'; tile.dataset.outfitId = outfitId;
  p.grid.append(tile);
  const face = outfitCardFace(context, text, outfitId);
  // The 126 px tile shows the art and the ribbon only (as the charm tiles show no name); the name is the tile's label.
  tile.setAttribute('role', 'img'); tile.setAttribute('aria-label', face.name);
  const card = createRewardCard(tile, { content: context.content, assets: outfitAssets(context.manifest), text }, face,
    { at: { x: OUTFIT_TILE_PX / 2, y: OUTFIT_TILE_PX / 2 }, px: OUTFIT_TILE_PX });
  card.el.style.opacity = '1';
}

/** Mec-002 §2.6: Skip shown iff `completeNowOffered`, labelled with the live price; buttons re-enable on a state change. */
function renderSkip(p: Parts, context: ViewContext, text: Text, state: GameState): void {
  const celebration = state.celebration;
  if (!celebration || celebration.completes) return;
  const offered = completeNowOffered(context.content, state);
  p.skip.hidden = !offered;
  if (offered) p.skipLabel.textContent = skipLabel(text, completeNowPriceCents(context.content, state, celebration.projectId));
}

/** Presentation §8.2 tile preview: the bubble with the 200×200 image, name and description; the backdrop dismisses it. */
function openPreview(p: Parts, context: ViewContext, typeId: string): void {
  removePreview(p);
  const type = context.content.charms.types.find(t => t.id === typeId)!;
  context.log.record('ui.rewardTile', { typeId });
  p.section.insertAdjacentHTML('beforeend', `<div class="tpp-preview-backdrop" data-action="dismiss-preview"></div>`
    + `<aside class="tpp-reward-preview ns-modal" data-type-id="${escapeHtml(typeId)}">${image({ assets: assetsFrom(context.manifest) }, type.sprite)}`
    + `<span class="tpp-preview-name" data-string-key="content.charm.name">${escapeHtml(type.name)}</span>`
    + `<span class="tpp-preview-description" data-string-key="content.charm.description">${escapeHtml(type.description)}</span></aside>`);
}

/** Tile → preview; backdrop → dismiss; Collect / Skip → one dispatch, both buttons disabled until the next state change. */
function clickHandler(p: Parts, context: ViewContext): (event: Event) => void {
  return event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || p.section.hidden) return;
    const action = target.dataset.action;
    if (action === 'preview' && target.dataset.typeId) openPreview(p, context, target.dataset.typeId);
    else if (action === 'dismiss-preview') removePreview(p);
    else if ((action === 'collect' || action === 'skip') && !(target as HTMLButtonElement).disabled) {
      p.skipButton.disabled = true; p.collect.disabled = true;
      context.store.dispatch({ type: action === 'collect' ? 'collectRewards' : 'skipWait' });
    }
  };
}

const removePreview = (p: Parts) => p.section.querySelectorAll('.tpp-preview-backdrop, .tpp-reward-preview').forEach(el => el.remove());

/** Presentation §8.2 collecting (DEC-049 §2): icons flash 300 ms staggered 120 ms, each rising 40 px and fading with a `tick` of
 * the rising arpeggio, hold 500 ms, the popup fades 200 ms, then hides. */
function playCollect(p: Parts, context: ViewContext, schedule: (ms: number, fn: () => void) => void, hide: () => void): void {
  p.section.dataset.state = 'collecting';
  p.skipButton.disabled = true; p.collect.disabled = true;
  const tiles = [...p.grid.querySelectorAll<HTMLElement>('.tpp-reward-tile')];
  const ticks = createTickSeq(() => context.audio);
  tiles.forEach((tile, i) => schedule(i * COLLECT.staggerMs, () => {
    tile.classList.add('tpp-flash');
    ticks.tick();
    tile.animate?.([{ filter: 'brightness(1)', transform: 'translateY(0)', opacity: 1 },
      { filter: 'brightness(1.8)', transform: `translateY(-${COLLECT.risePx / 2}px)`, opacity: 1, offset: 0.4 },
      { filter: 'brightness(1)', transform: `translateY(-${COLLECT.risePx}px)`, opacity: 0 }], { duration: COLLECT.flashMs, fill: 'forwards' });
  }));
  const fadeAt = collectMs(tiles.length) - COLLECT.fadeMs;
  schedule(fadeAt, () => fade(p.section, 1, 0, COLLECT.fadeMs));
  schedule(fadeAt + COLLECT.fadeMs, hide);
}

/** Presentation §8.2 `milestonePopup`: opens on `celebration.stepped {milestone}` or from state (idempotent, fork 7); dispatches `collectRewards` / `skipWait`. */
export function createMilestonePopup(root: HTMLElement, context: ViewContext): MilestonePopup {
  const { content, store } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', milestonePopup({ text, assets: assetsFrom(context.manifest), idPrefix: 'milestone-popup', state: 'hidden' }));
  const p = partsOf(root.lastElementChild as HTMLElement);
  p.section.dataset.state = 'normal';
  let timers: ReturnType<typeof setTimeout>[] = [];
  let waiting: (() => void)[] = [];
  const schedule = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers = []; };
  const hide = (runWaiting: boolean) => {
    clearTimers();
    p.section.hidden = true; p.section.dataset.state = 'normal';
    removePreview(p);
    const queued = waiting; waiting = [];
    if (runWaiting) for (const fn of queued) fn();
  };
  const open = (state: GameState) => {
    if (state.celebration?.step !== 'milestone' || !p.section.hidden) return;
    renderContent(p, context, text, state, state.celebration);
    addOutfitTile(p, context, text, state.celebration);   // before flipInTiles: the outfit tile joins the CARD.staggerMs sequence
    p.skipButton.disabled = false; p.collect.disabled = false;
    renderSkip(p, context, text, state);
    p.section.hidden = false;
    fade(p.section, 0, 1, POPUP_FADE_MS);
    flipInTiles(p, context, schedule);
  };
  const refresh = (state: GameState) => {
    if (p.section.hidden || p.section.dataset.state === 'collecting') return;
    p.skipButton.disabled = false; p.collect.disabled = false;
    renderSkip(p, context, text, state);
  };
  const onClick = clickHandler(p, context);
  p.section.addEventListener('click', onClick);
  const offs = [
    store.subscribe('celebration.stepped', (event, after) => { if (event.step === 'milestone') open(after); }),
    store.subscribe('celebration.started', (event, after) => { if (event.replay) open(after); }),
    store.subscribe('rewards.collected', () => { if (!p.section.hidden) playCollect(p, context, schedule, () => hide(true)); }),
    store.subscribe('celebration.ended', () => hide(false)),
    store.subscribe('state.reset', () => hide(false)),
    ...RENDER_ON.map(type => store.subscribe(type, (_event, after) => refresh(after))),
  ];
  open(store.getState());
  return {
    isOpen: () => !p.section.hidden,
    afterHidden(fn) { if (p.section.hidden) fn(); else waiting.push(fn); },
    close: () => hide(false),
    destroy() { hide(false); for (const off of offs) off(); p.section.removeEventListener('click', onClick); p.section.remove(); },
  };
}
