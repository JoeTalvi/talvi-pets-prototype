// @vitest-environment jsdom
import '../view/setup';
import Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Audio } from '../../src/app/audio';
import { heartMomentData } from '../../src/ui/panels/dialogue';
import { CONFETTI_DEPTH, FLASH_DEPTH } from '../../src/view/celebration/Confetti';
import { HEART_ARRIVED, HEART_MOMENT_END, heartPlan } from '../../src/view/celebration/heartMoment';
import { CARD, HEART, HEART_PET_DEPTH } from '../../src/view/celebration/timings';
import { destroyScene } from '../view/sceneHarness';
import { designSetup, type DesignSetup, type SetupOptions } from '../view/designHarness';

const rigs: DesignSetup[] = [];
afterEach(() => { for (const r of rigs.splice(0)) r.panels.dialogue.destroy(); vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Short walk-over bounds so the fulfil hold (walkOverMs + fulfilmentUseHoldMs) releases at 400 ms, inside the moment. */
const SHORT_HOLD = [{ file: 'tuning.json', path: '/walkOverMs', value: 300 }, { file: 'tuning.json', path: '/fulfilmentUseHoldMs', value: 100 }];
/** The Dog's first want (FX-CONTENT-MIN `soft-nap`) grants rug + cushion: 2 cards. With the verb added: 3 cards. */
const THREE_CARDS = { file: 'pets/dog.json', path: '/wants/0/reward', value: [{ kind: 'items', items: [{ typeId: 'rug', count: 1 }, { typeId: 'cushion', count: 1 }] }, { kind: 'verb', verb: 'sit-on' }] };
const VIGNETTE_ONLY = { file: 'pets/dog.json', path: '/wants/0/reward', value: [{ kind: 'vignette' }] };
const box = (s: DesignSetup) => s.root.querySelector<HTMLElement>('.tpp-dialogue')!;
const layer = (s: DesignSetup) => s.root.querySelector<HTMLElement>('.tpp-heart-moment');
const line = (s: DesignSetup) => box(s).querySelector('.tpp-dialogue-line')!.textContent;
const cards = (s: DesignSetup) => [...s.root.querySelectorAll<HTMLElement>('.tpp-reward-card')];
const emitters = (s: DesignSetup) => s.scene.children.list.filter((c): c is Phaser.GameObjects.Particles.ParticleEmitter => c instanceof Phaser.GameObjects.Particles.ParticleEmitter);
const flashes = (s: DesignSetup) => s.scene.children.list.filter(c => c instanceof Phaser.GameObjects.Rectangle && c.depth === FLASH_DEPTH);
const fulfil = (s: DesignSetup) => s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });

type Rig = DesignSetup & { played: [string, number, number][]; seen: [string, number][]; now: () => number; step(to: number): void; tap(): void };
/** Fake clock (timers + performance), a recording audio, and a log of the moment's window events, all relative to the fulfil at t = 0. */
async function rig(options: SetupOptions = {}, edit?: (s: DesignSetup) => void): Promise<Rig> {
  const s = await designSetup({ patches: SHORT_HOLD, ...options });
  rigs.push(s);
  edit?.(s);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const t0 = performance.now(), now = () => Math.round(performance.now() - t0);
  const played: [string, number, number][] = [], seen: [string, number][] = [];
  s.context.audio = { play: (id: string, opts?: { semitones?: number }) => { played.push([id, opts?.semitones ?? 0, now()]); } } as unknown as Audio;
  for (const type of [HEART_ARRIVED, HEART_MOMENT_END, 'tpp:heartHit', 'tpp:heartSettle']) {
    const on = () => seen.push([type, now()]);
    window.addEventListener(type, on);
  }
  return Object.assign(s, { played, seen, now, step: (to: number) => vi.advanceTimersByTime(to - now()), tap: () => layer(s)?.click() });
}

describe('VERIFY-WORK-038-2-01 the §5 Big beat table (two and three cards)', () => {
  for (const [n, patches] of [[2, []], [3, [THREE_CARDS]]] as const) {
    it(`VERIFY-WORK-038-2-01: ${n} cards — hitstop, riser, dim, hit, fly, cards, send, settle; onEnd and the vignette at ${HEART.totalMs(n)}`, async () => {
      const s = await rig({ patches: [...SHORT_HOLD, ...patches] }, d => {
        vi.spyOn(d.scene.tweens, 'pauseAll'); vi.spyOn(d.scene.cameras.main, 'shake');
      });
      fulfil(s);
      expect(s.state().dialogue.current?.source).toBe('vignette');
      expect(s.scene.tweens.pauseAll).toHaveBeenCalledTimes(1);
      expect(s.played).toEqual([['sfx/riser', 0, 0]].map(([id, k, t]) => [String(id).replace('sfx/', ''), k, t]));
      const dim = layer(s)!.querySelector<HTMLElement>('.tpp-heart-moment-dim')!;
      expect([dim.style.opacity, dim.style.background.includes(`rgba(40, 28, 18, ${HEART.dimAlpha})`)]).toEqual(['0', true]);
      s.step(HEART.hitstopMs! - 1); expect(dim.style.opacity).toBe('0');
      s.step(HEART.hitstopMs!); expect(dim.style.opacity).toBe('1');
      s.step(HEART.hitAt - 1);
      expect([s.played.some(p => p[0] === 'heart'), s.scene.heartPet, flashes(s).length]).toEqual([false, null, 0]);
      s.step(HEART.hitAt);
      expect(s.played.filter(p => p[0] === 'heart')).toEqual([['heart', 0, 450]]);
      expect(layer(s)!.dataset.beat).toBe('hit');
      expect(flashes(s).map(f => (f as Phaser.GameObjects.Rectangle).alpha)).toEqual([HEART.flashPeak]);
      expect(s.scene.cameras.main.shake).toHaveBeenCalledWith(HEART.shakeMs, HEART.shakeIntensity);
      const confetti = emitters(s).filter(e => e.depth === CONFETTI_DEPTH);
      expect(confetti.map(e => e.getParticleCount())).toEqual([HEART.confetti]);
      expect(layer(s)!.querySelectorAll('.tpp-glyph-burst .tpp-glyph')).toHaveLength(HEART.glyphs);
      const pet = s.scene.heartPet!;
      expect([pet.anims.currentAnim?.key, pet.depth, pet.scrollFactorX, pet.scale]).toEqual(['pet-dog-react', HEART_PET_DEPTH, 0, HEART.petScale]);
      const hop = s.scene.tweens.getTweensOf(pet).find(t => t.data.some(d => (d as Phaser.Tweens.TweenData).key === 'y'));
      expect(hop?.data[0]).toEqual(expect.objectContaining({ duration: HEART.hopMs, yoyo: true, repeat: HEART.hops - 1 }));
    });
  }
});

describe('VERIFY-WORK-038-2-01 (cont.) the count, reveal, send and settle', () => {
  for (const [n, patches] of [[2, []], [3, [THREE_CARDS]]] as const) {
    it(`VERIFY-WORK-038-2-01: ${n} cards — the count at 1750 (tick +7), reveals, send ticks, settle; onEnd and the vignette at ${HEART.totalMs(n)}`, async () => {
      const s = await rig({ patches: [...SHORT_HOLD, ...patches] });
      const plan = heartPlan(n, true);
      fulfil(s);
      s.step(plan.flyEnd - 1);
      expect(s.seen.filter(e => e[0] === HEART_ARRIVED)).toEqual([]);
      s.step(plan.flyEnd);
      expect(s.seen.filter(e => e[0] === HEART_ARRIVED)).toEqual([[HEART_ARRIVED, 1750]]);
      expect(s.played.filter(p => p[0] === 'tick')[0]).toEqual(['tick', 7, 1750]);
      s.step(plan.endAt - 1);
      expect(s.played.filter(p => p[0] === 'reveal')).toEqual(Array.from({ length: n }, (_, i) => ['reveal', 2 * i, HEART.cardsAt + i * CARD.staggerMs]));
      expect(s.seen.find(e => e[0] === 'tpp:heartSettle')).toEqual(['tpp:heartSettle', plan.settleAt]);
      expect(plan.sendAt).toBe(n === 2 ? 2670 : 2920);
      // One rising send tick per card (the arpeggio after the count tick +7, reset for the Send).
      expect(s.played.filter(p => p[0] === 'tick').slice(1).map(p => p[1])).toEqual([0, 4, 7].slice(0, n));
      expect(s.played.filter(p => p[0] === 'tick').slice(1).every(p => p[2] > plan.sendAt! && p[2] <= plan.settleAt)).toBe(true);
      expect([box(s).hidden, layer(s) !== null]).toEqual([true, true]);
      s.step(plan.endAt);
      expect(plan.endAt).toBe(n === 2 ? 3370 : 3620);
      expect([box(s).hidden, layer(s), line(s), s.scene.heartPet]).toEqual([false, null, s.state().dialogue.current!.lines[0], null]);
      expect(s.seen.find(e => e[0] === HEART_MOMENT_END)).toEqual([HEART_MOMENT_END, plan.endAt]);
      expect(s.played.filter(p => p[0] === 'heart')).toHaveLength(1);
    });
  }

  it('VERIFY-WORK-038-2-01: the cards mount at 1500 / 1750 and send at 2670 to the design toggle; one card = 3120 by the same arithmetic', async () => {
    const s = await rig();
    fulfil(s);
    s.step(HEART.cardsAt - 1); expect(cards(s)).toHaveLength(0);
    s.step(HEART.cardsAt); expect(cards(s)).toHaveLength(1);
    s.step(HEART.cardsAt + CARD.staggerMs); expect(cards(s).map(c => c.dataset.kind)).toEqual(['items', 'items']);
    s.step(2669); expect(layer(s)!.dataset.beat).not.toBe('send');
    s.step(2670); expect(layer(s)!.dataset.beat).toBe('send');
    expect(heartPlan(1, false).endAt).toBe(3120);
    expect([HEART.totalMs(1), HEART.totalMs(2), HEART.totalMs(3)]).toEqual([3120, 3370, 3620]);
  });
});

describe('VERIFY-WORK-038-2-02 skip-to-result', () => {
  it('VERIFY-WORK-038-2-02: second Heart — tap at 300 consumed; 700 jumps to the result (arrived, all cards face-up); 1000 consumed; hold end 1300 → half send + settle; onEnd at 1650', async () => {
    const s = await rig({ edit: st => { st.pets.dog.hearts = 1; } });
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    fulfil(s);
    expect(s.seen).toEqual([]);
    dispatch.mockClear();
    s.step(300); s.tap();
    expect([layer(s)!.dataset.beat, box(s).hidden]).toEqual(['anticipation', true]);
    s.step(700); s.tap();
    expect(layer(s)!.dataset.beat).toBe('result');
    expect(s.seen.filter(e => e[0] === HEART_ARRIVED)).toEqual([[HEART_ARRIVED, 700]]);
    expect(cards(s).map(c => c.style.opacity)).toEqual(['1', '1']);
    s.step(1000); s.tap();
    expect(layer(s)!.dataset.beat).toBe('result');
    s.step(1299); expect(layer(s)!.dataset.beat).toBe('result');
    s.step(1300); expect(layer(s)!.dataset.beat).toBe('send');
    s.step(1500); expect([layer(s)!.dataset.beat, cards(s)]).toEqual(['settle', []]);
    expect(s.seen.find(e => e[0] === 'tpp:heartSettle')).toEqual(['tpp:heartSettle', 1500]);
    s.step(1649); expect(layer(s)).not.toBeNull();
    s.step(1650);
    expect([layer(s), box(s).hidden, s.scene.heartPet]).toEqual([null, false, null]);
    expect(s.seen.filter(e => e[0] === HEART_ARRIVED)).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('VERIFY-WORK-038-2-02: keys behave as taps; keys during the moment never reach the game keyboard; keyup passes', async () => {
    const s = await rig({ edit: st => { st.pets.dog.hearts = 1; } });
    fulfil(s);
    const game: string[] = [];
    window.addEventListener('keydown', () => game.push('down'));
    window.addEventListener('keyup', () => game.push('up'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    expect(game).toEqual(['up']);
    s.step(800);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(layer(s)!.dataset.beat).toBe('result');
    s.step(2000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(game).toEqual(['up', 'down']);
  });

});

describe('VERIFY-WORK-038-2-03 the first Heart', () => {
  it('VERIFY-WORK-038-2-03: first Heart (hearts 1) — taps at 700, 1500, 2000 ignored; 2100 (after the last flip ends at 2070) jumps to the result; no new state field', async () => {
    const s = await rig();
    const keys = Object.keys(s.state()).sort();
    fulfil(s);
    expect(heartPlan(2, true).lastFlipEnd).toBe(2070);
    for (const t of [700, 1500, 2000]) { s.step(t); s.tap(); expect(layer(s)!.dataset.beat).not.toBe('result'); }
    s.step(2100); s.tap();
    expect(layer(s)!.dataset.beat).toBe('result');
    expect(cards(s).map(c => c.style.opacity)).toEqual(['1', '1']);
    s.step(2100 + HEART.skipHoldMs + CARD.sendMs / 2 + HEART.fadeOutMs / 2);
    expect([layer(s), box(s).hidden]).toEqual([null, false]);
    expect(Object.keys(s.state()).sort()).toEqual(keys);
  });
});

describe('VERIFY-WORK-038-2-04 cards from the same dispatch, "New" view-local', () => {
  it('VERIFY-WORK-038-2-04: items (2 types, one already held) + verb → 3 cards; "New" only on the type held 0 before; the verb card reads "Dog can now …"', async () => {
    const s = await rig({ patches: [...SHORT_HOLD, THREE_CARDS, { file: 'strings.json', path: '/tpp.reward.verb', value: '{pet} can now {verb}' }], edit: st => { st.inventory.counts.rug = 0; st.inventory.counts.cushion = 2; } });
    fulfil(s);
    s.step(2100);
    const faces = cards(s).map(c => [c.dataset.kind, c.querySelector('.tpp-reward-card-name')!.textContent, c.querySelector('.tpp-reward-card-new') !== null]);
    const verb = s.context.content.verbs.find(v => v.id === 'sit-on')!;
    expect(faces).toEqual([
      ['items', s.context.content.charms.types.find(t => t.id === 'rug')!.name, true],
      ['items', s.context.content.charms.types.find(t => t.id === 'cushion')!.name, false],
      ['verb', `Dog can now ${verb.name}`, false],
    ]);
  });

  it('VERIFY-WORK-038-2-04: heartMomentData — one card per charm type, the verb, the space; a vignette entry has none; at most 3', async () => {
    const s = await designSetup();
    const after = s.state();
    after.inventory.counts.rug = 1;
    const data = heartMomentData('dog', 2, [{ kind: 'items', items: [{ typeId: 'rug', count: 1 }] }, { kind: 'space', siteId: 'garden' }, { kind: 'vignette' }], new Map(), after);
    expect(data).toEqual({ petId: 'dog', hearts: 2, cards: [{ kind: 'items', typeId: 'rug', heldBefore: 0 }, { kind: 'space', siteId: 'garden' }] });
    const four = heartMomentData('dog', 2, [{ kind: 'items', items: [{ typeId: 'rug', count: 1 }, { typeId: 'cushion', count: 1 }] }, { kind: 'verb', verb: 'sit-on' }, { kind: 'space', siteId: 'garden' }], new Map([['rug', 3]]), after);
    expect(four.cards.map(c => c.kind)).toEqual(['items', 'items', 'verb']);
    expect(four.cards[0]).toEqual({ kind: 'items', typeId: 'rug', heldBefore: 3 });
  });

  it('VERIFY-WORK-038-2-04: a vignette-only reward → no cards, onEnd at 2050 (fork (c))', async () => {
    const s = await rig({ patches: [...SHORT_HOLD, VIGNETTE_ONLY] });
    fulfil(s);
    s.step(2049);
    expect([cards(s), layer(s) !== null]).toEqual([[], true]);
    s.step(2050);
    expect([layer(s), box(s).hidden]).toEqual([null, false]);
  });
});

describe('VERIFY-WORK-038-2-05 vignette after; cancel on reset, close and scene change', () => {
  it('VERIFY-WORK-038-2-05: the store advancing the dialogue during the moment — at the end the box shows the line the state holds', async () => {
    const s = await rig();
    fulfil(s);
    s.context.store.dispatch({ type: 'advanceDialogue' });
    s.step(HEART.totalMs(2));
    const current = s.state().dialogue.current;
    if (current) expect([box(s).hidden, line(s)]).toEqual([false, current.lines[current.index]]);
    else expect(box(s).hidden).toBe(true);
  });

  it('VERIFY-WORK-038-2-05: state.reset mid-moment cancels it cleanly (no layer, cards, pet, key capture or late show; Hearts released)', async () => {
    const s = await rig();
    fulfil(s);
    s.step(1800);
    expect(cards(s).length).toBeGreaterThan(0);
    s.context.store.dispatch({ type: 'reset' });
    expect([layer(s), box(s).hidden, cards(s), s.root.querySelectorAll('.tpp-glyph-burst').length]).toEqual([null, true, [], 0]);
    expect(s.seen.filter(e => e[0] === HEART_MOMENT_END)).toHaveLength(1);
    const game: string[] = [];
    window.addEventListener('keydown', () => game.push('down'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    s.step(5000);
    expect([game, box(s).hidden]).toEqual([['down'], true]);
  });

});

describe('VERIFY-WORK-038-2-05 (cont.)', () => {
  it('VERIFY-WORK-038-2-05: with Stars hidden the moment still plays and the Hearts pulse once (at the arrival)', async () => {
    const s = await rig();
    s.context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    fulfil(s);
    s.step(HEART.totalMs(2));
    expect(s.root.querySelector<HTMLElement>('.tpp-hearts')!.dataset.pulses).toBe('1');
  });

  it('VERIFY-WORK-038-2-05: a dialogue closed through the store during the moment cancels it; nothing shows later', async () => {
    const t = await rig();
    fulfil(t);
    const source = t.state().dialogue.current!.source;
    for (let i = 0; i < 20 && t.state().dialogue.current?.source === source; i++) t.context.store.dispatch({ type: 'advanceDialogue' });
    if (t.state().dialogue.current === null) {
      expect([layer(t), box(t).hidden]).toEqual([null, true]);
      t.step(HEART.totalMs(2));
      expect(box(t).hidden).toBe(true);
    } else {
      t.step(HEART.totalMs(2));
      expect([layer(t), box(t).hidden]).toEqual([null, false]);
    }
  });

  it('VERIFY-WORK-038-2-05: the Hearts count holds n − 1 until the heart arrives at 1750, then shows n', async () => {
    const s = await rig();
    fulfil(s);
    const hearts = () => s.root.querySelector<HTMLElement>('.tpp-hearts')!.textContent;
    const before = hearts();
    s.step(1749); expect(hearts()).toBe(before);
    s.step(1750); expect(hearts()).not.toBe(before);
  });
});

describe('VERIFY-WORK-038-2-06 reduced motion', () => {
  it('VERIFY-WORK-038-2-06: no hitstop, flash, shake or hop; the dim, riser, heart, reveal, tick, cards and the count stay; same total', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const s = await rig({}, d => { vi.spyOn(d.scene.tweens, 'pauseAll'); vi.spyOn(d.scene.cameras.main, 'shake'); });
    fulfil(s);
    s.step(HEART.hitAt);
    expect(s.scene.tweens.pauseAll).not.toHaveBeenCalled();
    expect(s.scene.cameras.main.shake).not.toHaveBeenCalled();
    expect(flashes(s).filter(f => (f as Phaser.GameObjects.Rectangle).active)).toHaveLength(0);
    const pet = s.scene.heartPet!;
    expect(s.scene.tweens.getTweensOf(pet).some(t => t.data.some(d => (d as Phaser.Tweens.TweenData).key === 'y'))).toBe(false);
    expect(layer(s)!.querySelector<HTMLElement>('.tpp-heart-moment-dim')!.style.opacity).toBe('1');
    s.step(HEART.totalMs(2) - 1);
    expect(new Set(s.played.map(p => p[0]))).toEqual(new Set(['riser', 'heart', 'tick', 'reveal']));
    expect(s.seen.filter(e => e[0] === HEART_ARRIVED)).toHaveLength(1);
    s.step(HEART.totalMs(2));
    expect([layer(s), box(s).hidden]).toEqual([null, false]);
  });
});
