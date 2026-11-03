import Phaser from 'phaser';
import type { PetId, ProjectId, SiteId } from '@sim/state';
import { siteOf } from '@sim/space';
import { registerClips, type SheetEntry } from '../anims';
import { Bubble, REACTION_EMOJI, textFrom } from '../objects/Bubble';
import { PetSprite } from '../objects/PetSprite';
import type { ViewContext } from '../context';
import { DustPoof } from './DustPoof';
import { burstConfetti } from './Confetti';
import { glyphBurst } from './glyphBurst';
import { ARRIVE, DUST_CLIP, DUST_LIFETIME } from './timings';

/** DEC-049 §3/§8 beat text (order fork (d)): the door hop height, the dust scales, the door confetti / ♥ counts, the reaction pitch. */
export const ARRIVE_BEATS = { hopPx: 24, startDustScale: 0.4, stepDustScale: 0.25, doorConfetti: 20, doorTints: [0xb5523f, 0xd9a441],
  mateHearts: 16, heartSpreadPx: 90, heartFlightMs: 700, doorSemitones: 4 } as const;

export type Arrival = { projectId: ProjectId; petId: PetId };
/** WORK-034-3: a site arrival (`state.siteArrival`): the site's `arrivalPath`, the 🎵 at its end, no door fade. */
export type SiteArrival = { siteId: SiteId; petId: PetId };
export const isSiteArrival = (arrival: Arrival | SiteArrival): arrival is SiteArrival => 'siteId' in arrival;
type Point = { x: number; y: number };
type Facing = 'left' | 'right';
export type ArrivalBeat = 'walk' | 'door' | 'greeting' | 'fade' | 'finished';

/** "Walks in through its door" (renders screen 5 note 2): the sprite fades over this after the 🎵 clears. */
export const ARRIVAL_FADE_MS = 250;

/** The horizontal direction of a segment; a vertical segment keeps the previous facing. */
function facingOf(from: Point, to: Point, previous: Facing): Facing {
  if (to.x < from.x) return 'left';
  if (to.x > from.x) return 'right';
  return previous;
}

/** The walked path: the house's `arrivalPath` for a project arrival, the site's for a site arrival. */
function arrivalPathOf(content: ViewContext['content'], arrival: Arrival | SiteArrival): readonly Point[] {
  if (isSiteArrival(arrival)) return siteOf(content, arrival.siteId).arrivalPath;
  const house = content.street.houses.find(h => h.projectId === arrival.projectId);
  if (!house || house.arrivalPath.length === 0) throw new Error(`Arrival walk: project "${arrival.projectId}" has no street arrivalPath`);
  return house.arrivalPath;
}

/**
 * Presentation §7.6 arrival walk (WORK-023-2, replaces the M1 stub): the resident pet walks the house's `arrivalPath`
 * at `petSpeedRu × roomUnitPx` px/s with its walk clip, drawn above its house sprite (house depth + 1), shows the 🎵
 * greeting at the door point for `bubbleMs`, fades out over `ARRIVAL_FADE_MS`, then dispatches `arrivalFinished`
 * exactly once. The pose is view-local (never written to state). Advanced by `StreetScene.syncScene(deltaMs)`; the
 * beats are pure functions of the elapsed time, so the walk is frame-rate independent and a reload replays it from the
 * first point.
 */
export class ArrivalWalk {
  readonly sprite: PetSprite;
  readonly bubble: Bubble;
  readonly path: readonly Point[];
  /** Planned beat times (ms since the walk started), from content. */
  readonly plan: { doorMs: number; fadeMs: number; finishMs: number };
  /** Observed beats (ms since start as the frames crossed them) for the Chrome reads. */
  readonly timeline: { beat: ArrivalBeat; atMs: number }[] = [];
  finished = false;
  private elapsedMs = 0;
  private facing: Facing;
  private readonly lengths: number[];
  private readonly speedPxPerMs: number;
  private readonly effects: Phaser.GameObjects.GameObject[] = [];
  private readonly scene: Phaser.Scene;
  /** A site arrival has no door: the walk ends on the 🎵 and hands over to the street's pet sprite at the last point. */
  readonly fades: boolean;
  /** `houseDepth` null: the walker draws at its base y (a site arrival). */
  constructor(scene: Phaser.Scene, private readonly context: ViewContext, readonly arrival: Arrival | SiteArrival, houseDepth: number | null) {
    const { content, manifest, store } = context;
    this.scene = scene;
    this.path = arrivalPathOf(content, arrival);
    this.fades = !isSiteArrival(arrival);
    this.lengths = this.path.slice(1).map((p, i) => Math.hypot(p.x - this.path[i].x, p.y - this.path[i].y));
    const { petSpeedRu, roomUnitPx, bubbleMs, bubbleTextMs } = content.tuning;
    this.speedPxPerMs = petSpeedRu * roomUnitPx / 1000;
    const doorMs = this.lengths.reduce((a, b) => a + b, 0) / this.speedPxPerMs;
    this.plan = { doorMs, fadeMs: doorMs + bubbleMs, finishMs: doorMs + bubbleMs + (this.fades ? ARRIVAL_FADE_MS : 0) };
    const sheetId = content.pets[arrival.petId]?.sheet;
    const entry = manifest.entries.find(e => e.id === sheetId);
    if (entry && scene.textures.exists(entry.id)) registerClips(scene, entry as SheetEntry);
    this.facing = this.path.length > 1 ? facingOf(this.path[0], this.path[1], 'left') : 'left';
    const behaviour = { ...store.getState().pets[arrival.petId].behaviour,
      x: this.path[0].x, y: this.path[0].y, phase: 'walking' as const, facing: this.facing };
    this.sprite = new PetSprite(scene, arrival.petId, content.verbs, entry, behaviour);
    this.sprite.setDepthOverride(houseDepth === null ? null : houseDepth + 1);
    this.bubble = new Bubble(scene, arrival.petId, 0, textFrom(content.strings), { bubbleMs, bubbleTextMs }, () => {});
    this.timeline.push({ beat: 'walk', atMs: 0 });
    this.startBeat();
  }
  /** DEC-049 §3/§8 at 0: a small dust poof at the feet; a site arrival (the mate) also shows a 🎵 at the path start and plays `reaction`. */
  private startBeat(): void {
    this.poof(ARRIVE_BEATS.startDustScale);
    if (this.fades) return;
    this.bubble.follow(this.sprite.bubbleAnchor());
    this.bubble.show({ kind: 'emoji', class: 'greeting', glyph: REACTION_EMOJI.greeting });
    this.context.audio?.play('reaction');
  }
  /** A dust poof `scale` × the walker's size at its feet, faded and destroyed on the DustPoof schedule. */
  private poof(scale: number): void {
    const w = Math.max(1, this.sprite.displayWidth) * scale, h = Math.max(1, this.sprite.displayHeight) * scale;
    const poof = new DustPoof(this.scene, new Phaser.Geom.Rectangle(this.sprite.x - w / 2, this.sprite.y - h, w, h), this.sprite.depth + 1);
    this.effects.push(poof);
    this.scene.time.delayedCall(DUST_CLIP, () => { if (poof.active) poof.fade(); });
    this.scene.time.delayedCall(DUST_LIFETIME, () => poof.destroy());
  }
  /** Advances the walk by `dtMs` (the caller has clamped it). */
  update(dtMs: number): void {
    if (this.finished) return;
    const before = this.elapsedMs;
    this.elapsedMs += dtMs;
    const { doorMs, fadeMs, finishMs } = this.plan;
    if (before < doorMs) this.walkTo(Math.min(this.elapsedMs, doorMs));
    // DEC-049 §8: the mate kicks a tiny puff every `ARRIVE.stepDustMs` while walking.
    if (!this.fades) for (let k = Math.floor(before / ARRIVE.stepDustMs) + 1; k * ARRIVE.stepDustMs <= Math.min(this.elapsedMs, doorMs); k++)
      if (k * ARRIVE.stepDustMs < doorMs) this.poof(ARRIVE_BEATS.stepDustScale);
    if (before < doorMs) { this.bubble.follow(this.sprite.bubbleAnchor()); this.bubble.update(Math.min(this.elapsedMs, doorMs) - before); }
    if (before < doorMs && this.elapsedMs >= doorMs) this.reachDoor();
    if (this.elapsedMs > doorMs) this.bubble.update(this.elapsedMs - Math.max(before, doorMs));
    if (this.fades && this.elapsedMs >= fadeMs) {
      if (before < fadeMs) this.timeline.push({ beat: 'fade', atMs: this.elapsedMs });
      this.sprite.setAlpha(Math.max(0, 1 - (this.elapsedMs - fadeMs) / ARRIVAL_FADE_MS));
    }
    if (this.elapsedMs < finishMs) return;
    this.timeline.push({ beat: 'finished', atMs: this.elapsedMs });
    this.finish();
    this.context.store.dispatch({ type: 'arrivalFinished' });
  }
  /** `state.reset` / shutdown: removes the sprite and bubble and dispatches nothing. */
  cancel(): void { if (!this.finished) this.finish(); }
  private walkTo(ms: number): void {
    let left = ms * this.speedPxPerMs;
    for (let i = 0; i < this.lengths.length; i++) {
      const from = this.path[i], to = this.path[i + 1];
      this.facing = facingOf(from, to, this.facing);
      if (left <= this.lengths[i] || i === this.lengths.length - 1) {
        const f = this.lengths[i] === 0 ? 1 : Math.min(1, left / this.lengths[i]);
        this.sprite.sync({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, facing: this.facing });
        return;
      }
      left -= this.lengths[i];
    }
  }
  private reachDoor(): void {
    const door = this.path[this.path.length - 1];
    this.sprite.sync({ ...door, facing: this.facing });
    this.sprite.setClip(this.sprite.clipFor({ phase: 'idle', verb: null }));
    this.bubble.follow(this.sprite.bubbleAnchor());
    this.bubble.show({ kind: 'emoji', class: 'greeting', glyph: REACTION_EMOJI.greeting });
    this.timeline.push({ beat: 'door', atMs: this.elapsedMs }, { beat: 'greeting', atMs: this.elapsedMs });
    this.doorBeat(door);
  }
  /** DEC-049 §3/§8 at the door / path end: a 24 px hop (`ARRIVE.hopMs` there and back), 20 red-and-gold confetti (the Owl) or 16 ♥
   * (the mate, DOM glyphs over the overlay), and `reaction` +4 st. No flash, shake or hitstop (not a signature). */
  private doorBeat(door: Point): void {
    const sprite = this.sprite;
    this.scene.tweens.add({ targets: sprite, y: door.y - ARRIVE_BEATS.hopPx, duration: ARRIVE.hopMs / 2, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { if (sprite.active) sprite.setY(door.y); } });
    this.context.audio?.play('reaction', { semitones: ARRIVE_BEATS.doorSemitones });
    if (this.fades) {
      const h = Math.max(1, sprite.displayHeight);
      const confetti = burstConfetti(this.scene, new Phaser.Geom.Rectangle(door.x - h / 2, door.y - h, h, h),
        { count: ARRIVE_BEATS.doorConfetti, tints: ARRIVE_BEATS.doorTints });
      this.effects.push(confetti);
      return;
    }
    const root = typeof document !== 'undefined' ? document.getElementById('panels') : null;
    if (!root) return;
    const cam = this.scene.cameras.main;
    glyphBurst(root, { glyph: '♥', px: 36, count: ARRIVE_BEATS.mateHearts, color: 'var(--red)', spreadPx: ARRIVE_BEATS.heartSpreadPx, staggerMs: 0,
      flightMs: ARRIVE_BEATS.heartFlightMs, from: { x: door.x - cam.scrollX, y: door.y - sprite.displayHeight / 2 - cam.scrollY } });
  }
  private finish(): void {
    this.finished = true; this.bubble.destroy(); this.sprite.destroy();
    for (const effect of this.effects.splice(0)) effect.destroy();
  }
}
