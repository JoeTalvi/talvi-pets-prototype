import Phaser from 'phaser';
import type { Vector } from '@app/input/keyboard';
export class Joystick {
  vector: Vector = { x: 0, y: 0 };
  active = false;
  private pointerId = -1;
  private base: Phaser.GameObjects.Image;
  private knob: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene) {
    this.base = scene.add.image(220, 0, 'ui/Joystick_Base').setDisplaySize(280, 280).setAlpha(0.55).setScrollFactor(0).setDepth(2000);
    this.knob = scene.add.image(220, 0, 'ui/Joystick_Handle').setDisplaySize(120, 120).setAlpha(0.85).setScrollFactor(0).setDepth(2001);
    this.resize();
    scene.input.on('pointerdown', this.down); scene.input.on('pointermove', this.move); scene.input.on('pointerup', this.up);
    scene.input.on('gameout', this.release); scene.game.events.on('hidden', this.release); scene.scale.on('resize', this.resize);
    scene.events.once('shutdown', this.destroy);
  }
  private resize = () => {
    const scale = this.scene.scale.displaySize.width / 1920;
    const inset = document.getElementById('safe-area-probe');
    const style = inset ? getComputedStyle(inset) : undefined;
    const left = parseFloat(style?.paddingLeft ?? '0') / scale;
    this.base.setPosition(220 + left, this.scene.scale.gameSize.height - 300); this.release();
  };
  private down = (pointer: Phaser.Input.Pointer) => {
    if (!this.active && Math.abs(pointer.x - this.base.x) <= 140 && Math.abs(pointer.y - this.base.y) <= 140) { this.active = true; this.pointerId = pointer.id; this.move(pointer); }
  };
  private move = (pointer: Phaser.Input.Pointer) => {
    if (!this.active || pointer.id !== this.pointerId) return;
    const x = (pointer.x - this.base.x) / 80, y = (pointer.y - this.base.y) / 80;
    const divisor = Math.max(1, Math.hypot(x, y)); this.vector = { x: x / divisor, y: y / divisor };
    this.knob.setPosition(this.base.x + this.vector.x * 80, this.base.y + this.vector.y * 80);
  };
  private up = (pointer: Phaser.Input.Pointer) => { if (pointer.id === this.pointerId) this.release(); };
  release = () => { this.active = false; this.pointerId = -1; this.vector = { x: 0, y: 0 }; this.knob.setPosition(this.base.x, this.base.y); };
  private destroy = () => {
    this.scene.input.off('pointerdown', this.down); this.scene.input.off('pointermove', this.move); this.scene.input.off('pointerup', this.up); this.scene.input.off('gameout', this.release);
    this.scene.game.events.off('hidden', this.release); this.scene.scale.off('resize', this.resize);
  };
}
