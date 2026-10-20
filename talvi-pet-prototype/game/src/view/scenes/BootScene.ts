import Phaser from 'phaser';
import { log } from '@app/log';
import { spike } from '@app/spikeController';
import { manifest } from '../spikeManifest';
import { registerClips, type SheetEntry } from '../anims';
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => log('asset.loadError', { key: file.key, url: file.url }));
    this.load.once('complete', (_loader: Phaser.Loader.LoaderPlugin, totalComplete: number, totalFailed: number) => log('asset.loadComplete', { totalComplete, totalFailed }));
    for (const entry of manifest.entries) {
      if (entry.type === 'image') this.load.image(entry.id, `assets/${entry.url}`);
      if (entry.type === 'spritesheet' && entry.frame) this.load.spritesheet(entry.id, `assets/${entry.url}`, { frameWidth: entry.frame.w, frameHeight: entry.frame.h });
      if (entry.type === 'audio') this.load.audio(entry.id, entry.urls!.map(url => `assets/${url}`));
    }
  }
  create(): void {
    for (const entry of manifest.entries) if (entry.type === 'spritesheet' && this.textures.exists(entry.id)) registerClips(this, entry as SheetEntry);
    this.scene.start(spike.state.scene);
  }
}
