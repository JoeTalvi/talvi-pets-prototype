import Phaser from 'phaser';
import { readFileSync } from 'node:fs';
import { AssetManifest } from '../../src/content/schema/assets';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { createStore } from '../../src/app/store';
import { createLog } from '../../src/app/log';
import { createPersistence } from '../../src/app/persistence';
import { createAudio } from '../../src/app/audio';
import { createPresentationBus } from '../../src/app/presentationBus';
import { createKeyboard } from '../../src/app/input/keyboard';
import { registerClips } from '../../src/view/anims';
import { REGISTRY_KEY, type ViewContext } from '../../src/view/context';
import { manifest as minManifest } from '../content/helpers';
import { createMemoryStorage } from '../app/memoryStorage';
import { headerFor, testClock } from '../app/helpers';

export const realManifest = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));

/** A ViewContext over FX-CONTENT-MIN (or the content given): fake audio player, no-op persistence timers. */
export function contextFor(content: Content, state: GameState, storage: Storage = createMemoryStorage()): ViewContext {
  const clock = testClock();
  const log = createLog({ storage, ringLines: content.tuning.logRingLines, now: clock.now, wall: clock.wall });
  log.start(headerFor(state));
  const store = createStore(content, state);
  log.attach(store);
  const persistence = createPersistence({ storage, log, debounceMs: 60_000 });
  const audio = createAudio({ play: () => {}, setMute: () => {}, locked: () => false }, { available: new Set(), record: log.record });
  return { content, manifest: minManifest, store, log, persistence, audio, bus: createPresentationBus(log.record),
    keyboard: createKeyboard(), findings: [], lenient: false, debugOpen: false };
}

/** Adds a blank canvas texture (image or sprite sheet) the way anims.test.ts does. */
export function addTexture(scene: Phaser.Scene, id: string, w: number, h: number, frame?: { w: number; h: number }): void {
  if (scene.textures.exists(id)) return;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  if (frame) scene.textures.addSpriteSheet(id, canvas as unknown as HTMLImageElement, { frameWidth: frame.w, frameHeight: frame.h });
  else scene.textures.addImage(id, canvas as unknown as HTMLImageElement);
}

/** The real Dog sheet geometry and clips (6×7 at 256 px), plus `missing` and the given image ids. */
function seedTextures(scene: Phaser.Scene, images: readonly string[]): void {
  const dog = realManifest.entries.find(e => e.id === 'pets/dog-sheet')!;
  addTexture(scene, 'pets/dog-sheet', dog.px!.w, dog.px!.h, dog.frame);
  registerClips(scene, dog);
  addTexture(scene, 'missing', 64, 64);
  for (const id of images) addTexture(scene, id, 128, 128);
}

let game: Phaser.Game | undefined;

/** Boots a HEADLESS game with the context on the registry and starts `SceneClass`; resolves after its `create`. */
export function bootScene<T extends Phaser.Scene>(SceneClass: new () => T, context: ViewContext, data: object = {}, images: readonly string[] = []): Promise<T> {
  return new Promise(resolve => {
    game = new Phaser.Game({ type: Phaser.HEADLESS, width: 1920, height: 1080, banner: false, audio: { noAudio: true },
      callbacks: { preBoot: g => { g.registry.set(REGISTRY_KEY, context); } }, scene: [] });
    game.events.once('ready', () => {
      const scene = new SceneClass();
      game!.scene.add(scene.sys.settings.key, scene, false);
      scene.sys.events.once('create', () => { game!.loop.sleep(); resolve(scene); });
      seedTextures(game!.scene.systemScene, images);
      game!.scene.start(scene.sys.settings.key, data);
    });
  });
}

export function destroyScene(): void { game?.destroy(true); game = undefined; }
