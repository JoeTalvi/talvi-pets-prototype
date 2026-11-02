import Phaser from 'phaser';
import { inputFrozen } from '@sim/select';
import { moveVector } from '@app/input/move';
import type { SimEvent } from '@sim/events';
import type { GameState } from '@sim/state';
import type { EventOf } from '@app/store';
import { AvatarSprite } from '../objects/AvatarSprite';
import { Joystick } from '../objects/Joystick';
import { contextOf, type ViewContext } from '../context';
import { startSceneFor } from '../startup';
import { drawAlignment } from '../alignmentGrid';
import { previewLayers, type Preview } from '../preview';
import { DesignTint } from '../objects/DesignTint';

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
  }

  private teardown(): void {
    for (const off of this.unsubscribes.splice(0)) off();
    this.preview.destroy();
    this.designTint.destroy();
    this.joystick.destroy();
  }
}
