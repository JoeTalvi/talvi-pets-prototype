import Phaser from 'phaser';
import { DESIGN_TINT } from '../celebration/timings';

/** WORK-032-2 fix 4: a camera-fixed blue-grey rectangle over the world while `state.mode === 'design'`; the HTML overlay is untouched. */
export class DesignTint {
  readonly rect: Phaser.GameObjects.Rectangle;
  private readonly resize = (size: Phaser.Structs.Size) => { this.rect.setSize(size.width, size.height); };
  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale.gameSize;
    this.rect = scene.add.rectangle(0, 0, width, height, DESIGN_TINT.color).setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DESIGN_TINT.depth).setAlpha(DESIGN_TINT.alpha).setVisible(false);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize);
  }
  setOn(on: boolean): void { this.rect.setVisible(on); }
  get on(): boolean { return this.rect.visible; }
  destroy(): void { this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize); this.rect.destroy(); }
}
