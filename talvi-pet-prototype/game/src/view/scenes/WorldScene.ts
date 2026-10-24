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

export const FADE_MS = 250;

/** Presentation §4.1 frame and §4.2 subscriptions shared by Street and Interior. */
export abstract class WorldScene extends Phaser.Scene {
  context!: ViewContext;
  avatar!: AvatarSprite;
  joystick!: Joystick;
  transitioning = false;
  protected unsubscribes: (() => void)[] = [];
  abstract drawWorld(): void;
  /** Interior adds its own subscriptions and per-frame syncs. */
  protected subscribeScene(): void {}
  protected syncScene(): void {}

  create(): void {
    this.context = contextOf(this);
    this.cameras.main.setScroll(0, (1080 - this.scale.gameSize.height) / 2);
    this.drawWorld();
    this.avatar = new AvatarSprite(this, this.context.store.getState().avatar.x, this.context.store.getState().avatar.y);
    this.joystick = new Joystick(this, this.context);
    this.subscribeCommon();
    this.subscribeScene();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.transitioning = true;
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => { this.transitioning = false; });
    this.cameras.main.fadeIn(FADE_MS);
  }

  /** Foundation §4.2 frame: arbitrate input → `tick` → sync sprites from state. */
  update(_time: number, delta: number): void {
    const { store, keyboard, content } = this.context;
    const frozen = inputFrozen(content, store.getState()) || this.transitioning || this.context.debugOpen;
    this.joystick.setVisible(!frozen);
    store.dispatch({ type: 'tick', dtMs: delta, move: moveVector({ joystick: this.joystick, keyboard, frozen }) });
    if (this.transitioning) return;
    this.avatar.sync(store.getState().avatar);
    this.syncScene();
  }

  protected on<T extends SimEvent['type']>(type: T, fn: (event: EventOf<T>, stateAfter: GameState) => void): void {
    this.unsubscribes.push(this.context.store.subscribe(type, fn));
  }

  private subscribeCommon(): void {
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
    this.joystick.destroy();
  }
}
