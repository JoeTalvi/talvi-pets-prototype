import type Phaser from 'phaser';
import pkg from '../package.json';
import { AssetManifest } from '@content/schema/assets';
import { ContentError, loadContent, type Content } from '@content/load';
import type { GameState } from '@sim/state';
import { createStore, type Store } from '@app/store';
import { createLog, type Log, type SessionHeader } from '@app/log';
import { createPersistence, loadSave } from '@app/persistence';
import { createPresentationBus } from '@app/presentationBus';
import { createKeyboard } from '@app/input/keyboard';
import { installPointerRouting } from '@app/input/pointerRouting';
import { createAudio } from '@app/audio';
import { createGame } from '@view/game';
import { syncOverlay } from '@view/overlaySync';
import type { ViewContext } from '@view/context';
import { previewFlagsFrom } from '@view/preview';
import { findingsOf, hasErrors, lenientAllowed } from '@view/startup';
import { mountOverlay, setAlignmentGrid } from '@ui/overlay';
import { sampleFps } from '@ui/panels/debugPanel';
import { showContentError, showError } from '@ui/panels/errorScreen';
import { createRotateCurtain } from '@ui/panels/rotateCurtain';
import '@ui/styles/tokens.css';
import '@ui/styles/nineslice.css';
import '@ui/styles/panels.css';

/** Verification §3 FX-SEED / TOOL-008 default playtest seed for a fresh save. */
const FRESH_SEED = 1234;

function headerFor(state: GameState): SessionHeader {
  return { build: `tpp-${pkg.version}+${import.meta.env.MODE}`, schemaVersion: 1, seed: state.session.seed,
    cadence: state.session.eventIntervalMs, feedPresentation: state.session.feedPresentation,
    testerLabel: state.session.testerLabel, userAgent: navigator.userAgent,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } };
}

/** Foundation §4.2 steps 1–3: manifest, content shape, then resolution issues and checks as one findings list. */
async function loadInputs(): Promise<{ manifest: AssetManifest; content: Content; findings: ViewContext['findings']; lenient: boolean } | null> {
  const manifest = AssetManifest.parse(await (await fetch('assets/manifest.json')).json());
  let content: Content;
  try { content = loadContent(undefined); }
  catch (error) { if (error instanceof ContentError) { showContentError(error.issues); return null; } throw error; }
  const findings = findingsOf(content, manifest);
  const lenient = lenientAllowed(location.search, import.meta.env.DEV);
  if (hasErrors(findings) && !lenient) { showContentError(findings.filter(f => f.level === 'error')); return null; }
  return { manifest, content, findings, lenient };
}

/** Steps 4–6: save → store → log, persistence, bus, keyboard. */
function createKernel(content: Content): { store: Store; log: Log; context: Omit<ViewContext, 'manifest' | 'findings' | 'lenient'> } {
  const storage = localStorage;
  const log = createLog({ storage, ringLines: content.tuning.logRingLines });
  const { state } = loadSave(content, storage, log, FRESH_SEED);
  const store = createStore(content, state);
  log.start(headerFor(state));
  log.attach(store);
  store.subscribe('state.reset', (_event, after) => log.reset(headerFor(after)));
  const persistence = createPersistence({ storage, log, debounceMs: content.tuning.saveDebounceMs });
  persistence.attach(store);
  const bus = createPresentationBus(log.record);
  const keyboard = createKeyboard();
  return { store, log, context: { content, store, log, persistence, audio: null, bus, keyboard, debugOpen: false, headerFor, storage } };
}

/** Step 8 on `ready`: overlay sync, pointer routing, curtain, audio (attached exactly once), then `store.start()`. */
function onReady(game: Phaser.Game, root: HTMLElement, context: ViewContext): void {
  syncOverlay(game, root);
  installPointerRouting();
  const curtain = createRotateCurtain(root, context.log.record, context.content.strings);
  const orient = () => curtain.update(String(game.scale.orientation), game.device.input.touch);
  game.scale.on('orientationchange', orient); orient();
  const available = new Set(context.manifest.entries.filter(e => e.type === 'audio').map(e => e.id));
  const audio = createAudio({
    play: (id, opts) => { game.sound.play(id, opts); }, setMute: muted => { game.sound.mute = muted; }, locked: () => game.sound.locked,
  }, { available, record: context.log.record });
  context.audio = audio;
  context.fps = () => game.loop.actualFps;
  context.soundLocked = () => game.sound.locked;
  context.sample = state => sampleFps(context.fps!, context.log.record, state);
  audio.attach(context.store);
  audio.start(context.store.getState());
  context.store.start();
  if (import.meta.env.DEV) Object.assign(window, { __tpp: { game, store: context.store, content: context.content, log: context.log, context, sample: context.sample } });
}

function reportErrors(log: Log): void {
  const report = (error: unknown) => {
    const payload = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack ?? '' : '' };
    try { log.record('app.error', payload); } finally { showError(payload.message); }
  };
  window.addEventListener('error', event => report(event.error ?? event.message));
  window.addEventListener('unhandledrejection', event => report(event.reason));
}

async function boot(): Promise<void> {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) { showError('This prototype needs WebGL. Enable hardware graphics and reload.'); return; }
  const inputs = await loadInputs();
  if (!inputs) return;
  const { log, context: kernel } = createKernel(inputs.content);
  reportErrors(log);
  const context: ViewContext = { ...kernel, manifest: inputs.manifest, findings: inputs.findings, lenient: inputs.lenient };
  const root = document.getElementById('overlay')!;
  mountOverlay(root, context);
  // Dev-only `?grid=1`: the alignment grid on at boot so capture tools see it without opening the panel (WORK-014-3).
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('grid') === '1') { context.alignmentGrid = true; setAlignmentGrid(root, true); }
  // Dev-only `?preview=fill,pets,geometry,segments`: layer flags at boot (not toggles, so nothing is recorded).
  const preview = import.meta.env.DEV ? previewFlagsFrom(location.search) : null;
  if (preview) context.preview = preview;
  const game = createGame(context);
  game.events.once('ready', () => onReady(game, root, context));
}
boot().catch(error => showError(String(error)));
