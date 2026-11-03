import type { Content } from '@content/types';
import { image } from '@ui/panels/templates/shared';
import type { Point } from './starsBurst';
import { CARD } from './timings';

/** The built-in card kinds (spec §0 / §6). A later kind (WORK-037-3 `outfit`, gate Q13) passes a `RewardCardFace` instead. */
export type RewardCardSpec =
  | { kind: 'items'; typeId: string; /** Copies held before the grant; 0 shows the "New" ribbon (computed by the caller, no state). */ heldBefore: number }
  | { kind: 'verb'; petId: string; verbId: string }
  | { kind: 'space'; siteId: string };

/** What a card shows, resolved: an image asset id or a text glyph, a name line, and the "New" ribbon flag. */
export type RewardCardFace = { kind: string; imageId?: string; glyph?: string; name: string; isNew: boolean };

export type RewardCardContext = { content: Content; assets: Record<string, string>; text: (key: string, params?: Record<string, string | number>) => string };

export type RewardCard = {
  readonly el: HTMLElement;
  readonly face: RewardCardFace;
  /** Flip in: rotateY 90° → 0° and scale 1.1 → 1 over `CARD.flipMs`, after `delayMs`. */
  flipIn(delayMs?: number): void;
  /** Shrink and fly to `to` (overlay point) over `CARD.sendMs`, then remove itself and call `onDone`. */
  send(to: Point, onDone?: () => void): void;
  /** Remove now (skip, reset, scene change); no `onDone`. */
  cancel(): void;
};

/** The garden glyph a space card shows (spec §6 space card; no art row exists for it). */
export const SPACE_GLYPH = '🌱';
/** Verb emote size on a card (spec §0: "verb `emote` at 120 px"). */
export const CARD_GLYPH_PX = 120;

/** Resolves a built-in spec against content: charm sprite + name, verb emote + `tpp.reward.verb`, garden glyph + `tpp.toast.space`. */
export function cardFace(ctx: RewardCardContext, spec: RewardCardSpec): RewardCardFace {
  if (spec.kind === 'items') {
    const type = ctx.content.charms.types.find(t => t.id === spec.typeId);
    if (!type) throw new Error(`rewardCard: unknown charm type ${spec.typeId}`);
    return { kind: 'items', imageId: type.sprite, name: type.name, isNew: spec.heldBefore === 0 };
  }
  if (spec.kind === 'verb') {
    const verb = ctx.content.verbs.find(v => v.id === spec.verbId);
    if (!verb) throw new Error(`rewardCard: unknown verb ${spec.verbId}`);
    const pet = ctx.content.pets[spec.petId]?.name ?? spec.petId;
    return { kind: 'verb', glyph: verb.emote, name: ctx.text('tpp.reward.verb', { pet, verb: verb.name }), isNew: false };
  }
  return { kind: 'space', glyph: SPACE_GLYPH, name: ctx.text('tpp.toast.space'), isNew: false };
}

function cardMarkup(ctx: RewardCardContext, face: RewardCardFace, px: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `ns-tile tpp-reward-card tpp-reward-card--${face.kind}`;
  el.dataset.kind = face.kind;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { width: `${px}px`, height: `${px}px`, pointerEvents: 'none' });
  const art = face.imageId ? image({ assets: ctx.assets }, face.imageId, 'tpp-reward-card-art')
    : `<span class="tpp-reward-card-glyph" style="font-size:${CARD_GLYPH_PX}px">${face.glyph ?? ''}</span>`;
  el.innerHTML = art;
  const name = document.createElement('span');
  name.className = 'tpp-reward-card-name'; name.textContent = face.name;
  el.append(name);
  if (face.isNew) {
    const ribbon = document.createElement('span');
    ribbon.className = 'tpp-reward-card-new'; ribbon.dataset.stringKey = 'tpp.reward.new'; ribbon.textContent = ctx.text('tpp.reward.new');
    el.append(ribbon);
  }
  return el;
}

/**
 * DEC-049 spec §0 reward card (WORK-038-1, signature frozen): a `CARD.px` card centred on `at` in `root`'s overlay coordinates,
 * hidden until `flipIn`. View-only: `pointer-events: none`, no sim action.
 */
export function createRewardCard(root: HTMLElement, ctx: RewardCardContext, spec: RewardCardSpec | RewardCardFace,
  opts: { at: Point; px?: number }): RewardCard {
  const face = 'name' in spec ? spec : cardFace(ctx, spec);
  const px = opts.px ?? CARD.px;
  const el = cardMarkup(ctx, face, px);
  Object.assign(el.style, { position: 'absolute', left: `${opts.at.x - px / 2}px`, top: `${opts.at.y - px / 2}px`, opacity: '0' });
  root.append(el);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const card: RewardCard = {
    el, face,
    flipIn(delayMs = 0) {
      timers.push(setTimeout(() => { el.style.opacity = '1'; }, delayMs));
      el.animate?.([{ transform: 'perspective(800px) rotateY(90deg) scale(1.1)', opacity: 1 }, { transform: 'perspective(800px) rotateY(0deg) scale(1)', opacity: 1 }],
        { duration: CARD.flipMs, delay: delayMs, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' });
    },
    send(to, onDone) {
      const dx = to.x - opts.at.x, dy = to.y - opts.at.y;
      el.animate?.([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.6 }],
        { duration: CARD.sendMs, easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)', fill: 'forwards' });
      timers.push(setTimeout(() => { card.cancel(); onDone?.(); }, CARD.sendMs));
    },
    cancel() { for (const t of timers.splice(0)) clearTimeout(t); el.remove(); },
  };
  return card;
}
