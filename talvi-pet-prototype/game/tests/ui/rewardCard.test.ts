// @vitest-environment jsdom
import '../view/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/content/load';
import { createText } from '../../src/ui/overlay';
import { CARD } from '../../src/view/celebration/timings';
import { CARD_GLYPH_PX, SPACE_GLYPH, cardFace, createRewardCard, type RewardCardContext } from '../../src/view/celebration/rewardCard';

const content = loadContent();
const bed = content.charms.types.find(t => t.id === 'dog-bed')!;
const ctx: RewardCardContext = { content, assets: { [bed.sprite]: `/assets/${bed.sprite}.png` }, text: createText(content.strings) };
let root: HTMLElement;
let calls: { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions }[];
beforeEach(() => {
  root = document.createElement('div'); document.body.append(root);
  calls = [];
  HTMLElement.prototype.animate = function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) { calls.push({ el: this, frames, opts }); return {} as Animation; } as never;
});
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); delete (HTMLElement.prototype as { animate?: unknown }).animate; });

describe('VERIFY-WORK-038-1-05 reward card block', () => {
  it('items card: the charm sprite + name at 220 px; "New" iff heldBefore === 0; pointer-events none', () => {
    const fresh = createRewardCard(root, ctx, { kind: 'items', typeId: 'dog-bed', heldBefore: 0 }, { at: { x: 960, y: 540 } });
    expect([fresh.el.style.width, fresh.el.style.height, fresh.el.style.pointerEvents, CARD.px]).toEqual(['220px', '220px', 'none', 220]);
    expect(fresh.el.querySelector('img')?.dataset.assetId).toBe(bed.sprite);
    expect(fresh.el.querySelector('.tpp-reward-card-name')?.textContent).toBe(bed.name);
    expect(fresh.el.querySelector('.tpp-reward-card-new')?.textContent).toBe('New');
    expect([fresh.el.style.left, fresh.el.style.top]).toEqual(['850px', '430px']);
    const repeat = createRewardCard(root, ctx, { kind: 'items', typeId: 'dog-bed', heldBefore: 2 }, { at: { x: 0, y: 0 } });
    expect(repeat.el.querySelector('.tpp-reward-card-new')).toBeNull();
    expect(createRewardCard(root, ctx, { kind: 'items', typeId: 'dog-bed', heldBefore: 0 }, { at: { x: 0, y: 0 }, px: 260 }).el.style.width).toBe('260px');
  });

  it('verb card: the emote at 120 px and "Dog can now nap" from tpp.reward.verb + verbs[].name', () => {
    expect(content.strings['tpp.reward.verb']).toBe('{pet} can now {verb}');
    const card = createRewardCard(root, ctx, { kind: 'verb', petId: 'dog', verbId: 'nap' }, { at: { x: 0, y: 0 } });
    const glyph = card.el.querySelector<HTMLElement>('.tpp-reward-card-glyph')!;
    expect([glyph.textContent, glyph.style.fontSize, CARD_GLYPH_PX]).toEqual(['😴', '120px', 120]);
    expect(card.el.querySelector('.tpp-reward-card-name')?.textContent).toBe('Dog can now nap');
    expect(card.el.querySelector('.tpp-reward-card-new')).toBeNull();
  });

  it('space card: the garden glyph + tpp.toast.space; a resolved face (a later kind such as outfit) renders without changing the block', () => {
    const card = createRewardCard(root, ctx, { kind: 'space', siteId: 'garden' }, { at: { x: 0, y: 0 } });
    expect([card.el.querySelector('.tpp-reward-card-glyph')?.textContent, card.el.querySelector('.tpp-reward-card-name')?.textContent])
      .toEqual([SPACE_GLYPH, content.strings['tpp.toast.space']]);
    const outfit = createRewardCard(root, ctx, { kind: 'outfit', imageId: bed.sprite, name: 'Garden set', isNew: true }, { at: { x: 0, y: 0 } });
    expect([outfit.el.dataset.kind, outfit.el.querySelector('.tpp-reward-card-name')?.textContent, !!outfit.el.querySelector('.tpp-reward-card-new')]).toEqual(['outfit', 'Garden set', true]);
    expect(() => cardFace(ctx, { kind: 'items', typeId: 'nope', heldBefore: 0 })).toThrow(/unknown charm type/);
  });

});

describe('VERIFY-WORK-038-1-05 reward card block (motion)', () => {
  it('flipIn: rotateY 90 → 0 and scale 1.1 → 1 over 320 ms; send(): 400 ms then removed and onDone; cancel() removes it', () => {
    vi.useFakeTimers();
    const card = createRewardCard(root, ctx, { kind: 'items', typeId: 'dog-bed', heldBefore: 0 }, { at: { x: 960, y: 540 } });
    card.flipIn(250);
    const flip = calls.at(-1)!;
    expect([String(flip.frames[0].transform), String(flip.frames[1].transform), flip.opts.duration, flip.opts.delay])
      .toEqual(['perspective(800px) rotateY(90deg) scale(1.1)', 'perspective(800px) rotateY(0deg) scale(1)', CARD.flipMs, 250]);
    expect(CARD.flipMs).toBe(320);
    vi.advanceTimersByTime(250);
    expect(card.el.style.opacity).toBe('1');
    const done = vi.fn();
    card.send({ x: 100, y: 40 }, done);
    expect([calls.at(-1)!.opts.duration, String(calls.at(-1)!.frames[1].transform)]).toEqual([400, 'translate(-860px, -500px) scale(0.2)']);
    vi.advanceTimersByTime(CARD.sendMs - 1);
    expect([root.contains(card.el), done.mock.calls.length]).toEqual([true, 0]);
    vi.advanceTimersByTime(1);
    expect([root.contains(card.el), done.mock.calls.length]).toEqual([false, 1]);
    const other = createRewardCard(root, ctx, { kind: 'space', siteId: 'garden' }, { at: { x: 0, y: 0 } });
    const late = vi.fn();
    other.send({ x: 0, y: 0 }, late);
    other.cancel();
    vi.advanceTimersByTime(1000);
    expect([root.contains(other.el), late.mock.calls.length]).toEqual([false, 0]);
  });
});
