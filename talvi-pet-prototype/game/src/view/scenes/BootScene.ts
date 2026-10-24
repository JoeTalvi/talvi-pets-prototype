import Phaser from 'phaser';
import type { AssetEntry } from '@content/schema/assets';
import { registerClips, type SheetEntry } from '../anims';
import { contextOf } from '../context';
import { startSceneFor } from '../startup';

export const MISSING_TEXTURE = 'missing';

/** ASSET-019: the 64×64 magenta runtime fallback for an absent texture. */
export function ensureMissingTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MISSING_TEXTURE)) return;
  const graphics = scene.make.graphics({}, false);
  graphics.fillStyle(0xff00ff, 1).fillRect(0, 0, 64, 64);
  graphics.generateTexture(MISSING_TEXTURE, 64, 64);
  graphics.destroy();
}

function queue(load: Phaser.Loader.LoaderPlugin, entry: AssetEntry): void {
  if (entry.html) return;
  if (entry.type === 'image') load.image(entry.id, `assets/${entry.url}`);
  else if (entry.type === 'spritesheet') load.spritesheet(entry.id, `assets/${entry.url}`, { frameWidth: entry.frame!.w, frameHeight: entry.frame!.h });
  else if (entry.type === 'audio') load.audio(entry.id, entry.urls!.map(url => `assets/${url}`));
  else if (entry.type === 'font') load.font(entry.family!, `assets/${entry.url}`, 'woff2', { weight: entry.weight! });
}

export class BootScene extends Phaser.Scene {
  loaderTotals = { totalComplete: 0, totalFailed: 0 };
  constructor() { super('Boot'); }
  preload(): void {
    const { manifest, log } = contextOf(this);
    this.drawProgress();
    this.load.on('loaderror', (file: Phaser.Loader.File) => log.record('asset.loadError', { key: file.key, url: String(file.url) }));
    this.load.once('complete', (_loader: unknown, totalComplete: number, totalFailed: number) => { this.loaderTotals = { totalComplete, totalFailed }; });
    for (const entry of manifest.entries) queue(this.load, entry);
  }
  create(): void {
    const { manifest, store } = contextOf(this);
    ensureMissingTexture(this);
    for (const entry of manifest.entries) if (entry.type === 'spritesheet' && this.textures.exists(entry.id)) registerClips(this, entry as SheetEntry);
    const start = startSceneFor(store.getState());
    this.scene.start(start.key, start.data);
  }
  private drawProgress(): void {
    const height = this.scale.gameSize.height;
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear().fillStyle(0xd1c1a6, 1).fillRect(560, height / 2 - 12, 800, 24).fillStyle(0x8d6748, 1).fillRect(560, height / 2 - 12, 800 * value, 24);
    });
  }
}
