import Phaser from 'phaser';
import { createJoystickAdapter, type JoystickAdapter } from '@app/input/joystick';
import type { ViewContext } from '../context';

const DEPTH = 9500;

/** Presentation §3.2: Phaser pointers feed WORK-004-2's adapter; the knob shows centre + vector × range.
 * Shown only on a touch-first device (`context.touch`); on a desktop it stays hidden and captures no pointer. */
export class Joystick {
  readonly adapter: JoystickAdapter;
  private base: Phaser.GameObjects.Image;
  private knob: Phaser.GameObjects.Image;
  private tuning: ViewContext['content']['tuning']['joystick'];
  private range: number;
  private readonly enabled: boolean;
  constructor(private scene: Phaser.Scene, context: Pick<ViewContext, 'content' | 'log' | 'touch'>) {
    const tuning = context.content.tuning.joystick;
    this.tuning = tuning; this.range = tuning.range; this.enabled = context.touch === true;
    this.adapter = createJoystickAdapter({
      centre: () => this.centre(), range: tuning.range, captureHalf: tuning.baseDiameter / 2,
      record: context.log.record, now: () => performance.now(),
    });
    const key = (id: string) => (scene.textures.exists(id) ? id : 'missing');
    this.base = scene.add.image(0, 0, key('ui/Joystick_Base')).setDisplaySize(tuning.baseDiameter, tuning.baseDiameter).setAlpha(0.55).setScrollFactor(0).setDepth(DEPTH);
    this.knob = scene.add.image(0, 0, key('ui/Joystick_Handle')).setDisplaySize(tuning.knobDiameter, tuning.knobDiameter).setAlpha(0.85).setScrollFactor(0).setDepth(DEPTH + 1);
    scene.input.on('pointerdown', this.down); scene.input.on('pointermove', this.move); scene.input.on('pointerup', this.up);
    scene.input.on('gameout', this.release); scene.game.events.on('hidden', this.release);
    this.base.setVisible(this.enabled); this.knob.setVisible(this.enabled);
    this.layout();
  }
  /** Safe-area left inset (CSS px) converted to logical px. */
  private centre(): { x: number; y: number } {
    const tuning = this.tuning;
    const scale = this.scene.scale.displaySize.width / 1920 || 1;
    const probe = document.getElementById('safe-area-probe');
    const left = probe ? parseFloat(getComputedStyle(probe).paddingLeft) || 0 : 0;
    return { x: tuning.x + left / scale, y: this.scene.scale.gameSize.height - tuning.bottomOffset };
  }
  private layout(): void {
    const c = this.centre(), v = this.adapter.vector;
    this.base.setPosition(c.x, c.y); this.knob.setPosition(c.x + v.x * this.range, c.y + v.y * this.range);
  }
  private down = (p: Phaser.Input.Pointer) => { if (this.base.visible && this.adapter.down(p.id, p.x, p.y)) this.layout(); };
  private move = (p: Phaser.Input.Pointer) => { this.adapter.move(p.id, p.x, p.y); this.layout(); };
  private up = (p: Phaser.Input.Pointer) => { this.adapter.up(p.id); this.layout(); };
  release = () => { this.adapter.release(); this.layout(); };
  get active(): boolean { return this.adapter.active; }
  get vector(): { x: number; y: number } { return this.adapter.vector; }
  /** Hidden while input is frozen, and always on a non-touch device; hiding releases a held stick. */
  setVisible(visible: boolean): void {
    const shown = visible && this.enabled;
    if (!shown && this.adapter.active) this.release();
    if (this.base.visible !== shown) { this.base.setVisible(shown); this.knob.setVisible(shown); }
    if (shown) this.layout();
  }
  destroy(): void {
    this.adapter.release();
    this.scene.input.off('pointerdown', this.down); this.scene.input.off('pointermove', this.move); this.scene.input.off('pointerup', this.up);
    this.scene.input.off('gameout', this.release); this.scene.game.events.off('hidden', this.release);
  }
}
