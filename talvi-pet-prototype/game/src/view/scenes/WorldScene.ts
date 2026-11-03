import Phaser from 'phaser';
import { inputFrozen } from '@sim/select';
import { moveVector } from '@app/input/move';
import type { SimEvent } from '@sim/events';
import type { GameState } from '@sim/state';
import type { EventOf } from '@app/store';
import { AvatarSprite } from '../objects/AvatarSprite';
import { Joystick } from '../objects/Joystick';
import type { CharmSprite } from '../objects/CharmSprite';
import { contextOf, type ViewContext } from '../context';
import { startSceneFor } from '../startup';
import { drawAlignment } from '../alignmentGrid';
import { previewLayers, type Preview } from '../preview';
import { DesignTint } from '../objects/DesignTint';
import { startHeartScene, type HeartScene, type HeartSceneOptions } from '../celebration/heartScene';
import { HEART_MOMENT_BEGIN, HEART_MOMENT_END, type HeartMomentBeginDetail } from '../celebration/heartMoment';
import { playMakeover, type Makeover } from '../celebration/makeover';
import { Bubble, chatterBubble, reactionBubble, textFrom, verbBubble, wantBubble } from '../objects/Bubble';
import type { PetSprite } from '../objects/PetSprite';
import { REACT } from '../celebration/timings';

/** DEC-049 §9 beat text (order fork (d)): the love hop height; the first-use sparkle (6 ✨, +12 st tick). */
export const LOVE_HOP_PX = 10;
export const FIRST_USE = { glyphs: 6, semitones: 12, spreadPx: 50, ms: 600 } as const;
/** DEC-049 §9 first use per (pet, charm type) this session: view-local, one set per ViewContext (a reload starts a new one; no state). */
const firstUses = new WeakMap<ViewContext, Set<string>>();

export const FADE_MS = 250;

/** Presentation §4.1 frame and §4.2 subscriptions shared by Street and Interior. */
export abstract class WorldScene extends Phaser.Scene {
  context!: ViewContext;
  avatar!: AvatarSprite;
  joystick!: Joystick;
  transitioning = false;
  alignment: Phaser.GameObjects.Graphics | null = null;
  preview!: Preview;
  /** WORK-032-2 fix 4: the design-mode world tint every world scene owns (the street's stays off until it has a design mode, WORK-034). */
  designTint!: DesignTint;
  /** Which TOOL-002 stage-1 layers this scene offers (Interior: four; Street: geometry). */
  protected abstract readonly previewKind: 'interior' | 'street';
  protected unsubscribes: (() => void)[] = [];
  /** WORK-038-1 Heart scene seam (fork (a)): the running scene half; dropped when it ends (review WORK-038-1 A4). */
  private heart: HeartScene | null = null;
  /** WORK-032-2 fix 6b: the Heart moment's big `react` pet (the running scene half's), null outside the moment. */
  get heartPet(): Phaser.GameObjects.Sprite | null { return this.heart?.pet ?? null; }
  /** WORK-038-1 Heart scene seam: the scene's charm sprite at a slot (Interior and Street override). */
  charmAt(slotId: string): CharmSprite | undefined { void slotId; return undefined; }
  abstract drawWorld(): void;
  /** Interior adds its own subscriptions and per-frame syncs. */
  protected subscribeScene(): void {}
  protected syncScene(deltaMs: number): void { void deltaMs; }

  create(): void {
    this.context = contextOf(this);
    this.cameras.main.setScroll(0, (1080 - this.scale.gameSize.height) / 2);
    this.drawWorld();
    this.designTint = new DesignTint(this);
    this.syncDesignTint(this.context.store.getState());
    this.avatar = new AvatarSprite(this, this.context.store.getState().avatar.x, this.context.store.getState().avatar.y);
    this.avatar.sync(this.context.store.getState().avatar); // WORK-037-3: the worn outfit from the first frame (fade-in skips update's sync)
    this.joystick = new Joystick(this, this.context);
    this.subscribeCommon();
    this.subscribeScene();
    this.preview = previewLayers(this, this.context, this.previewKind);
    this.alignment = null;
    this.syncAlignmentGrid();
    const redraw = () => { this.alignment?.destroy(); this.alignment = null; this.syncAlignmentGrid(); };
    this.scale.on(Phaser.Scale.Events.RESIZE, redraw);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, redraw));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.transitioning = true;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => { this.transitioning = false; });
    this.cameras.main.fadeIn(FADE_MS);
  }

  /** Foundation §4.2 frame: arbitrate input → `tick` → sync sprites from state. */
  update(_time: number, delta: number): void {
    const { store, keyboard, content } = this.context;
    const frozen = inputFrozen(content, store.getState()) || this.transitioning || this.context.debugOpen || this.context.roomEditor?.open === true;
    this.joystick.setVisible(!frozen);
    this.syncAlignmentGrid();
    this.preview.sync();
    store.dispatch({ type: 'tick', dtMs: delta, move: moveVector({ joystick: this.joystick, keyboard, frozen }) });
    if (this.transitioning) return;
    this.avatar.sync(store.getState().avatar);
    this.syncScene(delta);
  }

  /** Debug row 18: draws or removes the crosshairs to follow `context.alignmentGrid` (view-only state). */
  syncAlignmentGrid(): void {
    const on = this.context.alignmentGrid === true;
    if (on && !this.alignment) this.alignment = drawAlignment(this);
    else if (!on && this.alignment) { this.alignment.destroy(); this.alignment = null; }
  }

  /** The tint follows `state.mode` (mode.changed, and the state at create so a reload or restart in design mode keeps it). */
  syncDesignTint(state: Pick<GameState, 'mode'>): void { this.designTint.setOn(state.mode === 'design'); }

  /** The scene's pet bubble, if it shows a pet (Interior: the resident; Street: the arrived site resident, WORK-034-3). */
  protected petBubble(petId?: string): Bubble | undefined { void petId; return undefined; }
  /**
   * The sprite of pet `petId` in this scene, for the love hop. Default: the scene's public `pet` field (read structurally;
   * InteriorScene). StreetScene overrides it to look the pet up by id in its street-pet layer (integration, review WORK-035-2-1 A8).
   */
  protected petSprite(petId: string): PetSprite | undefined {
    const pet = (this as { pet?: PetSprite }).pet;
    return pet?.petId === petId ? pet : undefined;
  }

  /** DEC-049 §9 love: the pet hops `LOVE_HOP_PX` over `REACT.hopMs` (by its origin, so the per-frame position sync keeps it). */
  private hopPet(petId: string): void {
    const pet = this.petSprite(petId);
    if (!pet || !pet.active) return;
    const ox = pet.originX, oy = pet.originY, lift = LOVE_HOP_PX / Math.max(1, pet.displayHeight);
    this.tweens.addCounter({ from: 0, to: 1, duration: REACT.hopMs, onUpdate: t => {
      if (pet.active) pet.setOrigin(ox, oy + lift * Math.sin((t.getValue() ?? 0) * Math.PI));
    }, onComplete: () => { if (pet.active) pet.setOrigin(ox, oy); } });
  }

  /** DEC-049 §9: the first `pet.verbStarted` per (pet, charm type) this session sparkles 6 ✨ at the charm and ticks +12 st. */
  private firstUse(petId: string, slotId: string, state: GameState): void {
    const typeId = Object.values(state.rooms).map(r => r.placements[slotId]).find(Boolean)
      ?? Object.values(state.spaces).map(s => s.placements[slotId]).find(Boolean);
    if (!typeId) return;
    const seen = firstUses.get(this.context) ?? new Set<string>();
    firstUses.set(this.context, seen);
    const key = `${petId}:${typeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    this.context.audio?.play('tick', { semitones: FIRST_USE.semitones });
    const charm = this.charmAt(slotId);
    if (!charm) return;
    const at = { x: charm.x, y: charm.y - charm.displayHeight / 2 };
    for (let i = 0; i < FIRST_USE.glyphs; i++) {
      const angle = (i / FIRST_USE.glyphs) * Math.PI * 2;
      const glyph = this.add.text(at.x, at.y, '✨', { fontSize: '32px' }).setOrigin(0.5).setDepth(charm.depth + 1);
      glyph.setData('tppFirstUse', true);
      this.tweens.add({ targets: glyph, x: at.x + Math.cos(angle) * FIRST_USE.spreadPx, y: at.y + Math.sin(angle) * FIRST_USE.spreadPx, alpha: 0,
        duration: FIRST_USE.ms, ease: 'Quad.easeOut', onComplete: () => glyph.destroy() });
    }
  }

  /** mec-008 §2.1 / MEC-007 §3 consumers: every bubble fact comes from an event payload (the view computes no taste). */
  protected subscribePetBubbles(): void {
    const { content } = this.context;
    const text = textFrom(content.strings);
    const mine = (petId: string) => { const bubble = this.petBubble(petId); return bubble && bubble.petId === petId ? bubble : undefined; };
    const name = (petId: string) => content.pets[petId]?.name ?? petId;
    this.on('pet.reacted', event => {
      const bubble = mine(event.petId);
      const shown = reactionBubble(text, name(event.petId), event);
      if (bubble) bubble.onBeat = beat => { if (beat === 'love') this.hopPet(event.petId); };
      // Q11(a): the ladder grade after a verb ends arrives as `pet.reacted {walkOver:false}` and shows at once.
      if (event.walkOver) bubble?.hold(shown); else bubble?.show(shown);
    });
    this.on('pet.verbStarted', (event, after) => {
      const shown = verbBubble(content, name(event.petId), event.verb);
      if (shown) mine(event.petId)?.show(shown);
      this.firstUse(event.petId, event.slotId, after);
    });
    this.on('pet.verbEnded', event => { mine(event.petId)?.clearClass('verb'); });
    // Q12(a): a want whose unmet tags are all hidden arrives as `tag: null` and shows ❓.
    this.on('pet.wantBubble', event => { mine(event.petId)?.show(wantBubble(content, text, name(event.petId), event.tag)); });
    this.on('pet.tapped', event => {
      const bubble = event.bubble.kind === 'want' ? wantBubble(content, text, name(event.petId), event.bubble.tag) : chatterBubble(event.bubble.line);
      mine(event.petId)?.show(bubble);
    });
  }
  protected on<T extends SimEvent['type']>(type: T, fn: (event: EventOf<T>, stateAfter: GameState) => void): void {
    this.unsubscribes.push(this.context.store.subscribe(type, fn));
  }

  private subscribeCommon(): void {
    this.on('mode.changed', (_event, after) => this.syncDesignTint(after));
    this.on('scene.changed', event => {
      this.transitioning = true;
      this.joystick.release();
      const next = startSceneFor({ scene: event.to });
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(next.key, next.data));
      this.cameras.main.fadeOut(FADE_MS);
    });
    this.on('state.reset', () => { this.transitioning = true; this.scene.start('Street', {}); });
    this.subscribeHeartScene();
    this.subscribeMakeover();
  }

  /**
   * WORK-038-1 fork (a): `heart.earned` starts the Heart moment's scene half in the Interior and the Street; the overlay's end removes it.
   * Review WORK-038-2 A4: a Heart whose overlay moment is queued behind another starts its scene half on that moment's begin event.
   */
  private subscribeHeartScene(): void {
    this.heart = null;
    let focusSlotId: string | null = null;
    /** The overlay moment playing now (from its begin event to its end), and the queued Hearts' scene halves by `petId:hearts`. */
    let playing: string | null = null;
    const queued = new Map<string, HeartSceneOptions>();
    const start = (opts: HeartSceneOptions) => {
      this.heart?.end();
      this.heart = startHeartScene(this, opts);
    };
    this.on('want.fulfilled', event => { focusSlotId = event.focusSlotId; });
    this.on('heart.earned', event => {
      const key = `${event.petId}:${event.hearts}`, opts = { petId: event.petId, focusSlotId, charmAt: (slotId: string) => this.charmAt(slotId) };
      if (playing === null || playing === key) start(opts); else queued.set(key, opts);
      focusSlotId = null;
    });
    const onMomentBegin = (e: Event) => {
      const { petId, hearts } = (e as CustomEvent<HeartMomentBeginDetail>).detail;
      playing = `${petId}:${hearts}`;
      const opts = queued.get(playing);
      if (opts) { queued.delete(playing); start(opts); }
    };
    const onMomentEnd = () => { playing = null; this.heart?.end(); this.heart = null; };
    window.addEventListener(HEART_MOMENT_BEGIN, onMomentBegin);
    window.addEventListener(HEART_MOMENT_END, onMomentEnd);
    this.unsubscribes.push(() => {
      window.removeEventListener(HEART_MOMENT_BEGIN, onMomentBegin); window.removeEventListener(HEART_MOMENT_END, onMomentEnd);
      this.heart?.destroy(); this.heart = null;
    });
  }

  /** WORK-037-3 (gate Q12; spec §10): `outfit.changed` (the Closet or debug row 25) plays the makeover on the avatar. */
  private subscribeMakeover(): void {
    let makeover: Makeover | null = null;
    this.on('outfit.changed', event => {
      makeover?.cancel();
      makeover = playMakeover(this, this.avatar, event.from, () => this.context.audio);
    });
    this.unsubscribes.push(() => { makeover?.cancel(); makeover = null; });
  }

  private teardown(): void {
    for (const off of this.unsubscribes.splice(0)) off();
    this.preview.destroy();
    this.designTint.destroy();
    this.joystick.destroy();
  }
}
