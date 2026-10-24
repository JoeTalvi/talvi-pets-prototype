import type Phaser from 'phaser';
import type { Content } from '@content/types';
import type { AssetManifest } from '@content/schema/assets';
import type { Finding } from '@sim/checks/types';
import type { GameState } from '@sim/state';
import type { Store } from '@app/store';
import type { Log } from '@app/log';
import type { Persistence } from '@app/persistence';
import type { Audio } from '@app/audio';
import type { PresentationBus } from '@app/presentationBus';
import type { Keyboard } from '@app/input/keyboard';
import type { SessionHeader } from '@app/log';
import type { PreviewFlags } from './preview/layer';

export type FpsState = 'idle' | 'walking';
export type FpsSample = { state: FpsState; windowMs: number; fpsMean: number; fpsMin: number };

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
  alignmentGrid?: boolean;      // debug row 18 / `?grid=1`: the active scene draws the crosshairs (view-only state)
  roomEditorRequested?: boolean; // debug row 15: WORK-015 attaches the room editor to this flag
  headerFor?: (state: GameState) => SessionHeader; // the `session.started` header (debug row 12 writes it after reset)
  fps?: () => number;           // last `game.loop.actualFps`
  soundLocked?: () => boolean | undefined; // `game.sound.locked` (undefined under noAudio)
  sample?: (state: FpsState) => Promise<FpsSample>; // GAP-4 sampler: writes `perf.sample`
  storage?: Storage;            // `tpp.save`/`tpp.log` storage (debug row 17); localStorage when absent
  reload?: () => void;          // `location.reload` when absent (debug row 17 Load)
  clipboard?: { writeText(text: string): Promise<void> }; // `navigator.clipboard` when absent (debug row 17 Copy)
  preview?: PreviewFlags;       // debug row 16 / `?preview=`: TOOL-002 stage-1 layers (view-only state)
};

export const REGISTRY_KEY = 'tpp';
export const contextOf = (scene: Phaser.Scene): ViewContext => scene.registry.get(REGISTRY_KEY) as ViewContext;
