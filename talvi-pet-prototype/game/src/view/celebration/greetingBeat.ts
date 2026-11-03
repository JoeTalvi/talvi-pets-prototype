import type Phaser from 'phaser';
import type { Audio } from '@app/audio';
import type { SimEvent, GreetEmote } from '@sim/events';
import type { PetId } from '@sim/state';
import { textFrom, type BubbleShow, type TextFn } from '../objects/Bubble';
import type { ViewContext } from '../context';
import { glyphBurst, type GlyphBurst } from './glyphBurst';
import type { Point } from './starsBurst';
import { ARRIVE, GREET, REACT } from './timings';

type GreetingPlayed = Extract<SimEvent, { type: 'greeting.played' }>;

/** DEC-046 (gate Q10(a)): the drawn outcome emote each pet shows (fork 1: the drawn emote, not "both 🎵"). */
export const GREET_EMOJI: Record<GreetEmote, string> = { friendly: '🎵', polite: '🙂', surprised: '😮' };
/** The medium-tier hop of spec §8 (§C names no greeting hop): `y − 24` and back over `ARRIVE.hopMs`. */
export const GREET_HOP_PX = 24;
/** Spec §10 "4 ♥ rise between them" (tier 1: px, spread, stagger, colour are not §C values; flight = `REACT.riseMs`). */
export const GREET_HEARTS = { glyph: '♥', count: 4, px: 44, spreadPx: 56, staggerMs: 60, flightMs: REACT.riseMs, color: 'var(--red)' } as const;

/** What the beat needs of one pet: a sprite to hop (display origin only) and a bubble to show. */
export type GreetingPet = {
  sprite: Phaser.GameObjects.Sprite & { bubbleAnchor(): Point };
  bubble: { show(bubble: BubbleShow): void };
  name: string;
};

export type GreetingBeatOptions = {
  scene: Phaser.Scene;
  a: GreetingPet | undefined;
  b: GreetingPet | undefined;
  emoteA: GreetEmote;
  emoteB: GreetEmote;
  text: TextFn;
  /** The DOM overlay the ♥ burst mounts on; null → no burst. */
  root: HTMLElement | null;
  /** World point → `root` point. */
  toOverlay(world: Point): Point;
  audio: () => Pick<Audio, 'play'> | null;
};

export type GreetingBeat = { cancel(): void };

/** One hop on the sprite's display origin, so `PetSprite.sync` (which sets x/y every frame) never fights it. */
function hop(scene: Phaser.Scene, sprite: GreetingPet['sprite']): Phaser.Tweens.Tween | null {
  if (!sprite.active) return null;
  const base = sprite.displayOriginY;
  return scene.tweens.add({ targets: sprite, displayOriginY: base + GREET_HOP_PX, duration: ARRIVE.hopMs / 2, yoyo: true, ease: 'Quad.easeOut',
    onComplete: () => { if (sprite.active) sprite.displayOriginY = base; },
    onStop: () => { if (sprite.active) sprite.displayOriginY = base; } });
}

function greet(opts: GreetingBeatOptions, pet: GreetingPet | undefined, emote: GreetEmote, semitones: number): Phaser.Tweens.Tween | null {
  opts.audio()?.play('reaction', { semitones });
  if (!pet) return null;
  pet.bubble.show({ kind: 'emoji', class: 'greeting', glyph: GREET_EMOJI[emote], tapText: opts.text('tpp.bubble.greeting', { pet: pet.name }) });
  return hop(opts.scene, pet.sprite);
}

function midpoint(a: GreetingPet | undefined, b: GreetingPet | undefined): Point | null {
  const points = [a, b].filter((p): p is GreetingPet => p !== undefined && p.sprite.active).map(p => p.sprite.bubbleAnchor());
  if (points.length === 0) return null;
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
}

/**
 * DEC-049 spec §10 "Pet-to-pet greeting (street)", on the frozen WORK-038-1 blocks: t 0 pet A's emote bubble, a hop and `reaction`
 * at 0 st; t `GREET.offsetMs` pet B's bubble, a hop, `reaction` at +4 st and 4 ♥ rising from between the two bubbles. Every outcome
 * plays the same beat (fork 2, DEC-016); reduced motion keeps the hops and the burst (fork 5: tiers rule 5 lists shake, hitstop, flash).
 */
export function playGreetingBeat(opts: GreetingBeatOptions): GreetingBeat {
  const tweens: (Phaser.Tweens.Tween | null)[] = [];
  let burst: GlyphBurst | null = null;
  tweens.push(greet(opts, opts.a, opts.emoteA, 0));
  const second = setTimeout(() => {
    tweens.push(greet(opts, opts.b, opts.emoteB, 4));
    const mid = midpoint(opts.a, opts.b);
    if (opts.root && mid) burst = glyphBurst(opts.root, { ...GREET_HEARTS, from: opts.toOverlay(mid) });
  }, GREET.offsetMs);
  return {
    cancel() {
      clearTimeout(second);
      burst?.cancel(); burst = null;
      for (const tween of tweens.splice(0)) tween?.stop();
    },
  };
}

/** The street's greeting hook: one beat per `greeting.played`; a pet's new greeting cancels its previous beat. */
export class GreetingBeats {
  private live = new Map<PetId, GreetingBeat>();
  constructor(private scene: Phaser.Scene, private petOf: (petId: PetId) => Omit<GreetingPet, 'name'> | undefined,
    private contextOf: () => ViewContext) {}

  played(event: GreetingPlayed): void {
    const { content } = this.contextOf();
    const text = textFrom(content.strings);
    const pet = (petId: PetId): GreetingPet | undefined => {
      const drawn = this.petOf(petId);
      return drawn ? { ...drawn, name: content.pets[petId]?.name ?? petId } : undefined;
    };
    for (const petId of [event.petA, event.petB]) { this.live.get(petId)?.cancel(); this.live.delete(petId); }
    const cam = this.scene.cameras.main;
    const beat = playGreetingBeat({ scene: this.scene, a: pet(event.petA), b: pet(event.petB), emoteA: event.emoteA, emoteB: event.emoteB, text,
      root: typeof document === 'undefined' ? null : document.getElementById('panels'),
      toOverlay: p => ({ x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom }),
      audio: () => this.contextOf().audio });
    this.live.set(event.petA, beat); this.live.set(event.petB, beat);
  }

  cancelAll(): void {
    for (const beat of new Set(this.live.values())) beat.cancel();
    this.live.clear();
  }
}
