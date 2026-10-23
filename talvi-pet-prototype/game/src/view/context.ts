import type Phaser from 'phaser';
import type { Content } from '@content/types';
import type { AssetManifest } from '@content/schema/assets';
import type { Finding } from '@sim/checks/types';
import type { Store } from '@app/store';
import type { Log } from '@app/log';
import type { Persistence } from '@app/persistence';
import type { Audio } from '@app/audio';
import type { PresentationBus } from '@app/presentationBus';
import type { Keyboard } from '@app/input/keyboard';

/** Everything a scene reads, set on `game.registry` under `tpp` before the scenes start (WORK-014 convention 2). */
export type ViewContext = {
  content: Content;
  manifest: AssetManifest;
  store: Store;
  log: Log;
  persistence: Persistence;
  audio: Audio | null;          // created on `game ready` (it plays through `game.sound`)
  bus: PresentationBus;
  keyboard: Keyboard;
  findings: Finding[];
  lenient: boolean;
  debugOpen: boolean;           // WORK-014-3's debug panel sets it; frozen input while open
  selectedSlotId?: string | null; // the chooser/sheet sets it while open; the Interior draws that outline `selected`
};

export const REGISTRY_KEY = 'tpp';
export const contextOf = (scene: Phaser.Scene): ViewContext => scene.registry.get(REGISTRY_KEY) as ViewContext;
