import { WorldScene } from './WorldScene';

/** Placeholder street (WORK-020 builds the real one): flat ground, the door rects to find the way back in. */
export class StreetScene extends WorldScene {
  constructor() { super('Street'); }
  init(): void { this.transitioning = false; }
  drawWorld(): void {
    this.add.rectangle(960, 540, 1920, 1080, 0xdce2c9).setDepth(0);
    this.add.rectangle(960, 760, 1100, 260, 0xd1c1a6).setDepth(0);
    this.add.text(960, 320, 'Street · integration placeholder', { fontFamily: 'Baloo 2', fontSize: '44px', color: '#503d2d' }).setOrigin(0.5).setDepth(1);
    for (const house of this.context.content.street.houses) {
      const { x, y, w, h } = house.door.rect;
      this.add.rectangle(x, y, w, h, 0x8d6748, 0.25).setOrigin(0).setDepth(1);
    }
  }
}
