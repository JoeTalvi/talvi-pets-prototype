import type { Audio } from '@app/audio';
import { glyphBurst } from './glyphBurst';
import { createRewardCard, type RewardCard, type RewardCardContext, type RewardCardSpec } from './rewardCard';
import { centreIn, type Point } from './starsBurst';
import { createTickSeq } from './tickSeq';
import { CARD, HEART, HEART_MOMENT } from './timings';

/** Dispatched on `window` whenever a moment ends or is cancelled; the scene half (`heartScene.ts`) removes itself on it. */
export const HEART_MOMENT_END = 'tpp:heartMomentEnd';
/** DEC-049 Hearts-counter seam: dispatched on `window` when the moment's heart reaches the counter (the fly's end, or a skip). */
export const HEART_ARRIVED = 'tpp:heartArrived';
/** Spec §5 hit frame, dispatched on `window` as a `CustomEvent<HeartHitDetail>`: the scene half flashes, shakes, bursts confetti and shows the ×2 pet. */
export const HEART_HIT = 'tpp:heartHit';
/** Spec §5 Settle, a `CustomEvent<HeartSettleDetail>`: the scene half fades its pet out over `ms`. */
export const HEART_SETTLE = 'tpp:heartSettle';
export type HeartHitDetail = { petId: string; /** The heart's centre in overlay coordinates. */ at: Point };
export type HeartSettleDetail = { ms: number };

/** What `heart.earned` and the same dispatch's reward events give the moment. */
export type HeartMomentData = { petId: string; /** The pet's Hearts after this one; 1 = its first Heart (unskippable until its cards show). */ hearts: number;
  cards: RewardCardSpec[] };

export type HeartMoment = {
  /** True from `start` until the moment ends (its timeline or a skip) or is cancelled. */
  active(): boolean;
  /** Starts a moment; while one plays the next waits for its end (ladder rule 2). */
  start(data: HeartMomentData): void;
  /** Ends the moment (and any queued one) without `onEnd` (state.reset, scene change, teardown). */
  cancel(): void;
};

/** Where the heart pops: centred, its top at 6 % of the 1920 px overlay width (the WORK-032-2 layout). */
const HEART_TOP_PX = Math.round((HEART_MOMENT.heartTopPct / 100) * 1920);
export const HEART_CENTRE: Point = { x: 960, y: HEART_TOP_PX + HEART.heartPx / 2 };
/** Spec §5 Hit "12 ♥ glyphs burst outward": the glyph size, ring, stagger and flight (tier-1 look constants). */
const GLYPHS = { px: 56, spreadPx: 220, staggerMs: 12, flightMs: 700 } as const;
/** The cards' row (overlay y share) and gap; each card rises this far as it flips in. */
const CARD_ROW = { yShare: 0.5, gapPx: 28, risePx: 120 } as const;
/** Send ticks land this far apart so the arpeggio clears `TICK_MIN_GAP_MS` (the last card lands at the full `CARD.sendMs`). */
const SEND_TICK_GAP_MS = 60;

/** The §5 Big timeline for `n` cards (all from `HEART`/`CARD`); `null` send for a vignette-only reward (fork (c)). */
export function heartPlan(n: number, first: boolean) {
  const flyEnd = HEART.flyAt + HEART.flyMs;
  const lastFlipEnd = n > 0 ? HEART.cardsAt + (n - 1) * CARD.staggerMs + CARD.flipMs : flyEnd;
  const sendAt = n > 0 ? lastFlipEnd + CARD.holdMs : null;
  const settleAt = sendAt === null ? flyEnd : sendAt + CARD.sendMs;
  const endAt = settleAt + HEART.fadeOutMs;
  const skipFrom = first ? Math.max(HEART.skipAfterMs, lastFlipEnd) : HEART.skipAfterMs;
  // A skip that would not end the moment sooner (result hold + half send + half settle) is ignored.
  const skipUntil = endAt - (HEART.skipHoldMs + CARD.sendMs / 2 + HEART.fadeOutMs / 2);
  return { dimAt: HEART.hitstopMs ?? 0, hitAt: HEART.hitAt, breatheAt: HEART.hitAt + HEART.popMs, flyAt: HEART.flyAt, flyEnd, lastFlipEnd,
    cardAt: (i: number) => HEART.cardsAt + i * CARD.staggerMs, sendAt, settleAt, endAt, skipFrom, skipUntil };
}

function mountLayer(onPointer: (e: Event) => void): { layer: HTMLElement; dim: HTMLElement; heart: HTMLElement } {
  const layer = document.createElement('div');
  layer.className = 'tpp-heart-moment'; layer.dataset.panel = 'heartMoment'; layer.dataset.beat = 'anticipation';
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'auto', zIndex: 'var(--z-popup)' });
  const dim = document.createElement('div');
  dim.className = 'tpp-heart-moment-dim';
  const shade = `rgba(40, 28, 18, ${HEART.dimAlpha})`, spot = HEART.spotlightPx;
  // The spotlight centres on the big pet: its feet at `petBaseY`, a 256 px frame scaled by `petScale` (as a share of 1080).
  const spotY = Math.round(HEART_MOMENT.petBaseY * 100 - (128 * HEART.petScale) / 1080 * 100);
  Object.assign(dim.style, { position: 'absolute', inset: '0', opacity: '0', pointerEvents: 'none',
    background: `radial-gradient(ellipse ${spot}px ${spot}px at 50% ${spotY}%, transparent 55%, ${shade} 100%)` });
  const heart = document.createElement('span');
  heart.className = 'tpp-heart-moment-heart'; heart.textContent = '♥'; heart.setAttribute('aria-hidden', 'true');
  Object.assign(heart.style, { position: 'absolute', left: `${HEART_CENTRE.x - HEART.heartPx / 2}px`, top: `${HEART_TOP_PX}px`,
    width: `${HEART.heartPx}px`, textAlign: 'center', opacity: '0', font: `800 ${HEART.heartPx}px/1 var(--font-body)`, color: 'var(--red)',
    textShadow: '0 0 40px rgba(255, 214, 170, 0.85), 0 10px 0 rgba(58, 42, 31, 0.55)', pointerEvents: 'none' });
  layer.append(dim, heart);
  for (const type of ['pointerdown', 'pointerup', 'click']) layer.addEventListener(type, onPointer);
  return { layer, dim, heart };
}

/** The visible Hearts counter (Interior HUD), or null (the street has none: the heart fades in place, fork (a)). */
function heartsCounter(root: HTMLElement): HTMLElement | null {
  const el = root.querySelector<HTMLElement>('.tpp-hearts');
  return el && !el.closest('[hidden]') ? el : null;
}

/** Spec §5 Send: the chooser tray when it is open (design mode), else the design toggle (on the street: the site toggle). */
function sendTarget(root: HTMLElement): Point {
  const tray = [...root.querySelectorAll<HTMLElement>('.tpp-chooser-sheet')].find(el => !el.closest('[hidden]'));
  const toggle = [...root.querySelectorAll<HTMLElement>('.tpp-design-toggle')].find(el => !el.closest('[hidden]'));
  const el = tray ?? toggle;
  return el ? centreIn(root, el) : { x: HEART_CENTRE.x, y: 1080 };
}

type Flags = { skippable: boolean; arrived: boolean; sending: boolean; result: boolean };
type Env = { root: HTMLElement; play: Audio['play']; cardContext: () => RewardCardContext | null; ticks: ReturnType<typeof createTickSeq>;
  onPointer: (e: Event) => void; finish: () => void };

/** One playing moment: its DOM, cards, timers and beat flags (the §5 Big timeline from `heartPlan`). */
class HeartRun {
  readonly parts: ReturnType<typeof mountLayer>;
  readonly flags: Flags = { skippable: false, arrived: false, sending: false, result: false };
  private cards: (RewardCard | null)[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  constructor(private env: Env, readonly data: HeartMomentData) {
    this.parts = mountLayer(env.onPointer);
    env.root.append(this.parts.layer);
  }
  private at(ms: number, fn: () => void): void { this.timers.push(setTimeout(fn, ms)); }
  private clearTimers(): void { for (const t of this.timers.splice(0)) clearTimeout(t); }
  private beat(name: string): void { this.parts.layer.dataset.beat = name; }

  begin(): void {
    const plan = heartPlan(this.data.cards.length, this.data.hearts === 1), { dim, heart } = this.parts;
    this.env.play('riser');
    this.at(plan.dimAt, () => { dim.style.opacity = '1'; dim.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: HEART.dimInMs, easing: 'ease-out' }); });
    this.at(plan.hitAt, () => this.hit());
    this.at(plan.breatheAt, () => { this.beat('hold');
      heart.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: HEART.holdMs, easing: 'ease-in-out' }); });
    this.at(plan.flyAt, () => this.fly());
    this.data.cards.forEach((_, i) => this.at(plan.cardAt(i), () => { this.beat('reveal'); this.mountCard(i, true); }));
    if (plan.sendAt !== null) this.at(plan.sendAt, () => this.send(CARD.sendMs));
    this.at(plan.settleAt, () => this.settle(HEART.fadeOutMs));
    if (plan.skipFrom < plan.skipUntil) {
      this.at(plan.skipFrom, () => { this.flags.skippable = true; });
      this.at(plan.skipUntil, () => { this.flags.skippable = false; });
    }
  }
  private hit(): void {
    this.beat('hit');
    this.parts.heart.style.opacity = '1';
    this.parts.heart.animate?.([{ transform: 'scale(0)', offset: 0 }, { transform: 'scale(1.35)', offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: HEART.popMs, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'both' });
    glyphBurst(this.parts.layer, { glyph: '♥', px: GLYPHS.px, count: HEART.glyphs, from: HEART_CENTRE, spreadPx: GLYPHS.spreadPx,
      staggerMs: GLYPHS.staggerMs, flightMs: GLYPHS.flightMs, color: 'var(--red)' });
    this.env.play('heart');
    window.dispatchEvent(new CustomEvent<HeartHitDetail>(HEART_HIT, { detail: { petId: this.data.petId, at: HEART_CENTRE } }));
  }
  private arrive(tick: boolean): void {
    if (this.flags.arrived) return;
    this.flags.arrived = true;
    this.parts.heart.style.opacity = '0';
    window.dispatchEvent(new Event(HEART_ARRIVED));
    if (tick) this.env.play('tick', { semitones: 7 });
  }
  private fly(): void {
    this.beat('count');
    const counter = heartsCounter(this.env.root);
    const to = counter ? centreIn(this.env.root, counter) : HEART_CENTRE;
    const dx = to.x - HEART_CENTRE.x, dy = to.y - HEART_CENTRE.y;
    this.parts.heart.animate?.([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: counter ? 1 : 0 }],
      { duration: HEART.flyMs, easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)', fill: 'forwards' });
    this.at(HEART.flyMs, () => this.arrive(counter !== null));
  }
  private mountCard(i: number, flip: boolean): void {
    const ctx = this.env.cardContext();
    if (!ctx || this.cards[i]) return;
    const n = this.data.cards.length, holder = document.createElement('div');
    holder.className = 'tpp-heart-card-row';
    Object.assign(holder.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.parts.layer.append(holder);
    const height = parseFloat(this.env.root.parentElement?.style.height ?? '') || 1080;
    const x = HEART_CENTRE.x + (i - (n - 1) / 2) * (CARD.px + CARD_ROW.gapPx);
    const card = createRewardCard(holder, ctx, this.data.cards[i], { at: { x, y: Math.round(height * CARD_ROW.yShare) } });
    card.el.dataset.heartCard = String(i);
    this.cards[i] = card;
    if (!flip) { card.el.style.opacity = '1'; return; }
    card.flipIn(0);
    holder.animate?.([{ transform: `translateY(${CARD_ROW.risePx}px)` }, { transform: 'translateY(0)' }], { duration: CARD.flipMs, easing: 'ease-out' });
    this.env.play('reveal', { semitones: 2 * i });
  }
  private send(ms: number): void {
    this.flags.sending = true; this.beat('send');
    this.env.ticks.reset();
    const to = sendTarget(this.env.root), live = this.cards.filter((c): c is RewardCard => c !== null);
    const gap = Math.min(SEND_TICK_GAP_MS, ms / Math.max(1, live.length));
    live.forEach((card, i) => card.send(to, () => this.env.ticks.tick(), ms - (live.length - 1 - i) * gap));
  }
  private settle(ms: number): void {
    this.flags.sending = true; this.beat('settle');
    this.parts.layer.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
    window.dispatchEvent(new CustomEvent<HeartSettleDetail>(HEART_SETTLE, { detail: { ms } }));
    this.at(ms, this.env.finish);
  }
  /** Skip-to-result: the heart in its counter, every card face-up, held `skipHoldMs`, then Send and Settle at half duration. */
  skip(): void {
    this.clearTimers();
    this.flags.result = true; this.beat('result');
    this.arrive(heartsCounter(this.env.root) !== null);
    this.data.cards.forEach((_, i) => { const card = this.cards[i]; if (card) card.el.style.opacity = '1'; else this.mountCard(i, false); });
    this.at(HEART.skipHoldMs, () => {
      if (this.cards.some(c => c !== null)) { this.send(CARD.sendMs / 2); this.at(CARD.sendMs / 2, () => this.settle(HEART.fadeOutMs / 2)); }
      else this.settle(HEART.fadeOutMs / 2);
    });
  }
  tap(): void { if (this.flags.skippable && !this.flags.sending && !this.flags.result) this.skip(); }
  dispose(): void { this.clearTimers(); for (const card of this.cards) card?.cancel(); this.cards = []; this.parts.layer.remove(); }
}

/**
 * DEC-049 spec §5 (Big), the overlay half of the Heart moment (WORK-038-2): riser and dim, the hit (♥ pop, 12 ♥ glyphs, `heart`,
 * `HEART_HIT` for the scene half), the breath, the fly into the Hearts counter (`HEART_ARRIVED` + `tick` +7), one reward card per
 * entry (`reveal` +0/+2/+4), the hold, Send (a rising `tick` per card) and Settle, then `onEnd` (the dialogue releases its held
 * vignette box). Skip-to-result from `skipAfterMs` (a pet's first Heart: once its cards show); every input during the moment is
 * consumed. View-only: no sim action, state or event.
 */
export function createHeartMoment(root: HTMLElement, onEnd: () => void, audio: () => Pick<Audio, 'play'> | null = () => null,
  cardContext: () => RewardCardContext | null = () => null): HeartMoment {
  let run: HeartRun | null = null;
  const queue: HeartMomentData[] = [];
  const teardown = () => {
    window.removeEventListener('keydown', onKey, true);
    if (!run) return;
    run.dispose(); run = null;
    window.dispatchEvent(new Event(HEART_MOMENT_END));
  };
  const finish = () => {
    if (!run) return;
    teardown(); onEnd();
    const next = queue.shift();
    if (next) begin(next);
  };
  const onPointer = (e: Event) => { e.stopPropagation(); e.preventDefault(); if (e.type === 'click') run?.tap(); };
  // Capture phase on window runs before the game keyboard's listener; keyup passes so a held key is not left stuck.
  function onKey(e: KeyboardEvent): void {
    if (!run) return;
    e.stopImmediatePropagation(); e.preventDefault();
    run.tap();
  }
  const env: Env = { root, play: (id, opts) => audio()?.play(id, opts), cardContext, ticks: createTickSeq(audio), onPointer, finish };
  function begin(next: HeartMomentData): void {
    run = new HeartRun(env, next);
    window.addEventListener('keydown', onKey, true);
    run.begin();
  }
  return {
    active: () => run !== null,
    start(next) { if (run) queue.push(next); else begin(next); },
    cancel() { queue.length = 0; teardown(); },
  };
}
