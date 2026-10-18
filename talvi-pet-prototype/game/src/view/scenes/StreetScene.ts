import { SpikeScene } from './SpikeScene';
export class StreetScene extends SpikeScene {
  constructor() { super('Street'); }
  drawWorld(): void {
    this.add.rectangle(960, 540, 1920, 1080, 0xdce2c9).setDepth(0);
    this.add.rectangle(960, 760, 1100, 260, 0xd1c1a6).setDepth(0);
    this.add.text(960, 320, 'Street · integration placeholder', { fontFamily: 'Baloo 2', fontSize: '44px', color: '#503d2d' }).setOrigin(0.5);
  }
}
