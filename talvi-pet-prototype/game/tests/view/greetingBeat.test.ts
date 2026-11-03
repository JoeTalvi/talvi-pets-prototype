// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { GREET_EMOJI, GREET_HEARTS, GREET_HOP_PX, playGreetingBeat, type GreetingBeatOptions, type GreetingPet } from '../../src/view/celebration/greetingBeat';
import { ARRIVE, GREET } from '../../src/view/celebration/timings';
import type { BubbleShow } from '../../src/view/objects/Bubble';
import type { GreetEmote } from '../../src/sim/events';

type TweenConfig = { targets: unknown; displayOriginY: number; duration: number; yoyo: boolean; onStop?(): void };

function sceneDouble() {
  const added: TweenConfig[] = [], stopped: TweenConfig[] = [];
  const pauseAll = vi.fn(), shake = vi.fn(), flash = vi.fn();
  const scene = {
    tweens: { add: (config: TweenConfig) => { added.push(config); return { stop: () => { stopped.push(config); config.onStop?.(); } }; }, pauseAll },
    anims: { pauseAll },
    cameras: { main: { shake, flash } },
  } as unknown as Phaser.Scene;
  return { scene, added, stopped, pauseAll, shake, flash };
}

function petDouble(name: string, x: number): GreetingPet & { shows: BubbleShow[] } {
  const shows: BubbleShow[] = [];
  const sprite = { active: true, x, y: 950, displayOriginY: 256, bubbleAnchor: () => ({ x, y: 820 }) } as unknown as GreetingPet['sprite'];
  return { sprite, bubble: { show: b => { shows.push(b); } }, name, shows };
}

function setup(emoteA: GreetEmote = 'friendly', emoteB: GreetEmote = 'polite', audioOn = true) {
  const double = sceneDouble();
  const a = petDouble('Owl', 700), b = petDouble('Mate', 900);
  const plays: [string, unknown][] = [];
  const root = document.createElement('div'); document.body.append(root);
  const opts: GreetingBeatOptions = { scene: double.scene, a, b, emoteA, emoteB, root,
    text: (key, params) => `${key}:${params?.pet ?? ''}`, toOverlay: p => p,
    audio: () => audioOn ? { play: (id, o) => { plays.push([id, o]); } } : null };
  return { ...double, a, b, plays, root, opts };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('VERIFY-WORK-036-2-01 spec §10 beat order and timing on the WORK-038-1 blocks', () => {
  it('t 0: bubble A, reaction 0 st, hop A; t GREET.offsetMs: bubble B, reaction +4 st, hop B, one 4 ♥ glyph burst without `to`; hops y − 24 yoyo over ARRIVE.hopMs; sim position untouched', () => {
    const t = setup();
    playGreetingBeat(t.opts);
    expect(t.a.shows.map(s => [s.kind, s.class, s.glyph])).toEqual([['emoji', 'greeting', '🎵']]);
    expect(t.b.shows).toEqual([]);
    expect(t.plays).toEqual([['reaction', { semitones: 0 }]]);
    expect(t.added.map(c => c.targets)).toEqual([t.a.sprite]);
    expect(t.root.querySelectorAll('.tpp-glyph-burst')).toHaveLength(0);
    vi.advanceTimersByTime(GREET.offsetMs - 1);
    expect(t.b.shows).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(GREET.offsetMs).toBe(120);
    expect(t.b.shows.map(s => [s.kind, s.class, s.glyph])).toEqual([['emoji', 'greeting', '🙂']]);
    expect(t.plays).toEqual([['reaction', { semitones: 0 }], ['reaction', { semitones: 4 }]]);
    expect(t.added.map(c => c.targets)).toEqual([t.a.sprite, t.b.sprite]);
    for (const c of t.added) expect([c.displayOriginY, c.duration * 2, c.yoyo]).toEqual([256 + GREET_HOP_PX, ARRIVE.hopMs, true]);
    expect(GREET_HOP_PX).toBe(24);
    const bursts = t.root.querySelectorAll('.tpp-glyph-burst');
    expect(bursts).toHaveLength(1);
    expect([...bursts[0].querySelectorAll('.tpp-glyph')].map(g => g.textContent)).toEqual(['♥', '♥', '♥', '♥']);
    expect([GREET_HEARTS.glyph, GREET_HEARTS.count, 'to' in GREET_HEARTS]).toEqual(['♥', 4, false]);
    expect([t.a.sprite.x, t.a.sprite.y, t.b.sprite.x, t.b.sprite.y]).toEqual([700, 950, 900, 950]);
    vi.advanceTimersByTime(3 * GREET_HEARTS.staggerMs + GREET_HEARTS.flightMs);
    expect(t.root.querySelectorAll('.tpp-glyph-burst')).toHaveLength(0);
  });

  it('cancel() before 120 stops B, its sound and the burst, and restores A\'s hop origin; audio null → no throw', () => {
    const t = setup();
    const beat = playGreetingBeat(t.opts);
    beat.cancel();
    vi.advanceTimersByTime(1000);
    expect([t.b.shows.length, t.plays.length, t.root.querySelectorAll('.tpp-glyph-burst').length]).toEqual([0, 1, 0]);
    expect(t.stopped.map(c => c.targets)).toEqual([t.a.sprite]);
    expect(t.a.sprite.displayOriginY).toBe(256);
    const silent = setup('friendly', 'friendly', false);
    expect(() => { playGreetingBeat(silent.opts); vi.advanceTimersByTime(200); }).not.toThrow();
    expect(silent.b.shows).toHaveLength(1);
  });

  it('a pet not drawn (undefined) → its bubble and hop are skipped, both sounds still play, no throw', () => {
    const t = setup();
    playGreetingBeat({ ...t.opts, b: undefined });
    vi.advanceTimersByTime(200);
    expect(t.plays).toHaveLength(2);
    expect(t.added).toHaveLength(1);
  });
});

describe('VERIFY-WORK-036-2-02 paired emotes on screen (DEC-046; forks 1 and 2)', () => {
  it('036-2-02 friendly → 🎵, polite → 🙂, surprised → 😮; tapText is tpp.bubble.greeting with {pet}; the same beat for each outcome', () => {
    expect(GREET_EMOJI).toEqual({ friendly: '🎵', polite: '🙂', surprised: '😮' });
    for (const [ea, eb] of [['friendly', 'friendly'], ['polite', 'surprised'], ['surprised', 'polite']] as [GreetEmote, GreetEmote][]) {
      const t = setup(ea, eb);
      playGreetingBeat(t.opts);
      vi.advanceTimersByTime(GREET.offsetMs);
      expect([t.a.shows[0].glyph, t.b.shows[0].glyph]).toEqual([GREET_EMOJI[ea], GREET_EMOJI[eb]]);
      expect([t.a.shows[0].tapText, t.b.shows[0].tapText]).toEqual(['tpp.bubble.greeting:Owl', 'tpp.bubble.greeting:Mate']);
      expect([t.plays.length, t.added.length, t.root.querySelectorAll('.tpp-glyph').length]).toEqual([2, 2, 4]);
      document.body.replaceChildren();
    }
  });
});

describe('VERIFY-WORK-036-2-05 reduced motion (tiers rule 5; fork 5)', () => {
  it('036-2-05 with prefers-reduced-motion: both sounds and both bubbles play; hops and the burst are kept (fork 5 default); no shake, hitstop or flash', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const t = setup();
    playGreetingBeat(t.opts);
    vi.advanceTimersByTime(GREET.offsetMs);
    expect([t.a.shows.length, t.b.shows.length, t.plays.length, t.added.length]).toEqual([1, 1, 2, 2]);
    expect(t.root.querySelectorAll('.tpp-glyph-burst')).toHaveLength(1);
    expect([t.pauseAll, t.shake, t.flash].map(f => f.mock.calls.length)).toEqual([0, 0, 0]);
  });
});
