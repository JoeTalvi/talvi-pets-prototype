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
import { startHeartScene, type HeartScene } from '../celebration/heartScene';
import { HEART_MOMENT_END } from '../celebration/heartMoment';
import { Bubble, chatterBubble, reactionBubble, textFrom, verbBubble, wantBubble } from '../objects/Bubble';

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
  /** WORK-038-1 Heart scene seam (fork (a)): every scene half started here, for teardown; the newest is last. */
  private hearts: HeartScene[] = [];
  /** WORK-032-2 fix 6b: the Heart moment's big `react` pet (the newest scene half's), null outside the moment. */
  get heartPet(): Phaser.GameObjects.Sprite | null { return this.hearts.at(-1)?.pet ?? null; }
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
  protected petBubble(_petId?: string): Bubble | undefined { return undefined; }

  /** mec-008 §2.1 / MEC-007 §3 consumers: every bubble fact comes from an event payload (the view computes no taste). */
  protected subscribePetBubbles(): void {
    const { content } = this.context;
    const text = textFrom(content.strings);
    const mine = (petId: string) => { const bubble = this.petBubble(petId); return bubble && bubble.petId === petId ? bubble : undefined; };
    const name = (petId: string) => content.pets[petId]?.name ?? petId;
    this.on('pet.reacted', event => {
      const bubble = mine(event.petId);
      const shown = reactionBubble(text, name(event.petId), event);
      // Q11(a): the ladder grade after a verb ends arrives as `pet.reacted {walkOver:false}` and shows at once.
      if (event.walkOver) bubble?.hold(shown); else bubble?.show(shown);
    });
    this.on('pet.verbStarted', event => {
      const shown = verbBubble(content, name(event.petId), event.verb);
      if (shown) mine(event.petId)?.show(shown);
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
  }

  /** WORK-038-1 fork (a): `heart.earned` starts the Heart moment's scene half in the Interior and the Street; the overlay's end removes it. */
  private subscribeHeartScene(): void {
    this.hearts = [];
    let focusSlotId: string | null = null;
    this.on('want.fulfilled', event => { focusSlotId = event.focusSlotId; });
    this.on('heart.earned', event => {
      this.hearts.at(-1)?.end();
      this.hearts.push(startHeartScene(this, { petId: event.petId, focusSlotId, charmAt: slotId => this.charmAt(slotId) }));
      focusSlotId = null;
    });
    const onMomentEnd = () => this.hearts.at(-1)?.end();
    window.addEventListener(HEART_MOMENT_END, onMomentEnd);
    this.unsubscribes.push(() => { window.removeEventListener(HEART_MOMENT_END, onMomentEnd); for (const h of this.hearts.splice(0)) h.destroy(); });
  }

  private teardown(): void {
    for (const off of this.unsubscribes.splice(0)) off();
    this.preview.destroy();
    this.designTint.destroy();
    this.joystick.destroy();
  }
}
