import Phaser from 'phaser';
import type { Content } from '@content/types';
import type { Reaction } from '@sim/state';
import type { SimEvent } from '@sim/events';

/** mec-008 §2.1 classes; `verb` is view-internal (the bus `class` for a verb-emote tap is `chatter`, order fork 4). */
export type BubbleClass = 'want' | 'chatter' | 'verb' | Reaction;
export type BubbleKind = 'icon' | 'emoji' | 'text';
export type BubbleShow = { kind: BubbleKind; class: BubbleClass; glyph?: string; icon?: string; text?: string; tapText?: string };
export type BubbleTap = { class: BubbleClass; text: string };
export type TextFn = (key: string, params?: Record<string, string>) => string;
type Tuning = Pick<Content['tuning'], 'bubbleMs' | 'bubbleTextMs'>;
type Current = BubbleShow & { ageMs: number; lifeMs: number };

/** mec-008 §2.1 reaction emoji; no new emoji set (art bible v1.4). */
export const REACTION_EMOJI: Record<Reaction, string> = { love: '❤️', like: '🙂', dislike: '💢', interrupted: '🤔', greeting: '🎵', stripped: '😢' };
export const BUBBLE_DEPTH = 8000;
const FADE_MS = 200;
const MIN_W = 168, MIN_H = 128, PADDING = 48, ICON = 72;
const FILL = 0xfffdf8, SHADOW = 0x3a2a1f, INK = '#3a2a1f';
/** The tail (24 px then 14 px circles) trails below-left of the body; the 14 px circle's bottom sits on the anchor (0, 0). */
const TAIL = [{ x: 0, y: -7, r: 7 }, { x: 12, y: -32, r: 12 }];
const BODY_GAP = 50;

/** `{param}` substitution over content strings (the view does not import `ui`). */
export function textFrom(strings: Record<string, string>): TextFn {
  return (key, params = {}) => (strings[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => params[name] ?? all);
}

/** mec-008 §2.1 Reaction row: emoji for `bubbleMs`; tap → `line` if present else `tpp.bubble.<reaction>` with `{pet}`. */
export function reactionBubble(text: TextFn, pet: string, event: Extract<SimEvent, { type: 'pet.reacted' }>): BubbleShow {
  return { kind: 'emoji', class: event.reaction, glyph: REACTION_EMOJI[event.reaction], tapText: event.line ?? text(`tpp.bubble.${event.reaction}`, { pet }) };
}

/** mec-008 §2.1 Verb row: `verbs[verb].emote`; tap → `emoteText` with `{pet}`. */
export function verbBubble(content: Content, pet: string, verbId: string): BubbleShow | null {
  const verb = content.verbs.find(v => v.id === verbId);
  if (!verb) return null;
  return { kind: 'emoji', class: 'verb', glyph: verb.emote, tapText: textFrom({ t: verb.emoteText })('t', { pet }) };
}

/** mec-008 §2.1 Want row: the tag icon, or ❓ for `tag === null` (Q12(a): a hidden-only want shows ❓, never the hidden tag). */
export function wantBubble(content: Content, text: TextFn, pet: string, tagId: string | null): BubbleShow {
  const tag = tagId === null ? undefined : content.tags.find(t => t.id === tagId);
  if (!tag) return { kind: 'emoji', class: 'want', glyph: '❓', tapText: text('tpp.bubble.wantHidden', { pet }) };
  // Play-session Q7: the tag name is lower case inside the sentence (renders.html); standalone pills keep their capitals.
  return { kind: 'icon', class: 'want', icon: tag.icon, tapText: text('tpp.bubble.want', { pet, tag: tag.name.toLowerCase() }) };
}

/** mec-008 §2.1 Chatter row: the line as text at once for `bubbleTextMs`; further taps are ignored while shown. */
export const chatterBubble = (line: string): BubbleShow => ({ kind: 'text', class: 'chatter', text: line });

/**
 * Presentation §6.3 + amendment 2026-10-21: one container per resident pet, the flat thought bubble
 * (ellipse body, two tail circles, soft layered shadow, no stroke) for every class (order fork 1).
 * Lifetimes run on the frame delta passed to `update` (no Phaser timers). One bubble per pet: newest wins.
 */
export class Bubble extends Phaser.GameObjects.Container {
  readonly shell: Phaser.GameObjects.Graphics;
  child: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null = null;
  bodyW = MIN_W;
  bodyH = MIN_H;
  private shown: Current | null = null;
  private pending: BubbleShow | null = null;
  constructor(scene: Phaser.Scene, readonly petId: string, petIndex: number, private text: TextFn, private tuning: Tuning,
    private onTapped: (tap: BubbleTap) => void) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.shell = scene.add.graphics();
    this.add(this.shell);
    this.setDepth(BUBBLE_DEPTH + petIndex).setVisible(false);
  }
  current(): { kind: BubbleKind; class: BubbleClass; text: string | null } | null {
    if (!this.shown) return null;
    return { kind: this.shown.kind, class: this.shown.class, text: this.shown.kind === 'text' ? this.shown.text ?? '' : this.shown.glyph ?? this.shown.icon ?? null };
  }
  /** The next bubble replaces the current one immediately; a pending walk-over bubble is superseded. */
  show(bubble: BubbleShow): void {
    this.pending = null;
    const lifeMs = bubble.kind === 'text' ? this.tuning.bubbleTextMs : this.tuning.bubbleMs;
    this.shown = { ...bubble, ageMs: 0, lifeMs };
    this.redraw();
  }
  /** MEC-007 §3: a walk-over reaction waits for the matching `pet.phaseChanged {to:'reacting'|'greeting'}`. */
  hold(bubble: BubbleShow): void { this.pending = bubble; }
  releasePending(): void { if (this.pending) this.show(this.pending); }
  dropPending(): void { this.pending = null; }
  clear(): void {
    this.shown = null;
    this.child?.destroy(); this.child = null;
    this.shell.clear();
    this.setVisible(false).setAlpha(1);
  }
  clearClass(cls: BubbleClass): void { if (this.shown?.class === cls && this.shown.kind !== 'text') this.clear(); }
  follow(anchor: { x: number; y: number }): void { this.setPosition(anchor.x, anchor.y); }
  update(dtMs: number): void {
    if (!this.shown) return;
    this.shown.ageMs += dtMs;
    const left = this.shown.lifeMs - this.shown.ageMs;
    if (left <= 0) { this.clear(); return; }
    this.setAlpha(left < FADE_MS ? left / FADE_MS : 1);
  }
  /** Tap-to-text (mec-008 §2.1): swaps an icon/emoji for its text; a text bubble ignores the tap. */
  tap(): boolean {
    const shown = this.shown;
    if (!shown || shown.kind === 'text' || shown.tapText === undefined) return false;
    this.show({ kind: 'text', class: shown.class, text: shown.tapText });
    this.onTapped({ class: shown.class, text: shown.tapText });
    return true;
  }
  /** The body ellipse's bounding box in world coordinates (the scene routes `bubble:<petId>` with it). */
  contains(x: number, y: number): boolean {
    if (!this.visible || !this.shown) return false;
    const c = this.bodyCentre();
    return Math.abs(x - (this.x + c.x)) <= this.bodyW / 2 && Math.abs(y - (this.y + c.y)) <= this.bodyH / 2;
  }
  private bodyCentre(): { x: number; y: number } { return { x: this.bodyW / 2 - 40, y: -BODY_GAP - this.bodyH / 2 }; }
  private redraw(): void {
    const shown = this.shown!;
    this.child?.destroy();
    this.child = this.makeChild(shown);
    const measured = shown.kind === 'text' ? { w: this.child.width + PADDING, h: this.child.height + PADDING } : { w: 0, h: 0 };
    this.bodyW = Math.max(MIN_W, Math.ceil(measured.w)); this.bodyH = Math.max(MIN_H, Math.ceil(measured.h));
    const c = this.bodyCentre();
    this.child.setPosition(c.x, c.y);
    this.drawShell(c);
    this.add(this.child);
    this.setSize(this.bodyW, this.bodyH).setVisible(true).setAlpha(1);
  }
  private makeChild(shown: BubbleShow): Phaser.GameObjects.Text | Phaser.GameObjects.Image {
    const scene = this.scene;
    if (shown.kind === 'icon') {
      const key = shown.icon && scene.textures.exists(shown.icon) ? shown.icon : 'missing';
      return scene.add.image(0, 0, key).setDisplaySize(ICON, ICON);
    }
    const resolution = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (shown.kind === 'emoji') return scene.add.text(0, 0, shown.glyph ?? '', { fontSize: '48px' }).setOrigin(0.5).setResolution(resolution);
    return scene.add.text(0, 0, shown.text ?? '', { fontFamily: 'Nunito', fontStyle: '600', fontSize: '28px', color: INK, align: 'center',
      wordWrap: { width: 400 } }).setOrigin(0.5).setResolution(resolution);
  }
  /** Layered fills stand in for the `0 4px 6px rgba(58,42,31,.18)` shadow; no stroke anywhere. */
  private drawShell(c: { x: number; y: number }): void {
    const g = this.shell.clear();
    for (const dy of [4, 5, 6]) {
      g.fillStyle(SHADOW, 0.06);
      g.fillEllipse(c.x, c.y + dy, this.bodyW + 2, this.bodyH + 2);
      for (const t of TAIL) g.fillCircle(t.x, t.y + dy, t.r + 1);
    }
    g.fillStyle(FILL, 1);
    g.fillEllipse(c.x, c.y, this.bodyW, this.bodyH);
    for (const t of TAIL) g.fillCircle(t.x, t.y, t.r);
  }
}
