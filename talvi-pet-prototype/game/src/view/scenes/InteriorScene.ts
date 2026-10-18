import { SpikeScene } from './SpikeScene';
import { CharmSprite } from '../objects/CharmSprite';
export class InteriorScene extends SpikeScene {
  constructor() { super('Interior'); }
  drawWorld(): void {
    this.add.image(0, 0, 'rooms/dog-room').setOrigin(0).setTint(0xefe7d6).setDepth(0);
    new CharmSprite(this, 1140, 800, 'charms/dog-bed');
    new CharmSprite(this, 940, 650, 'charms/lamp');
  }
}
