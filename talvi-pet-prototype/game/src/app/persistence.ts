import type { Content } from '@content/types';
import { initialState, type GameState } from '@sim/state';
import { parseSaveValue, type DiscardReason } from '@sim/state.schema';
import { STORAGE_KEYS, type Log } from './log';
import type { Store } from './store';

/** CONTRACT-PERSIST v1.4 (core §8, TECH-007): `tpp.save` = `{ schemaVersion: 1, savedAt, state }`. */
export { STORAGE_KEYS };

export type SaveRecorder = Pick<Log, 'record' | 'recordQuota'>;
export type LoadResult = { state: GameState; source: 'save' | 'fresh'; reason?: DiscardReason };

/** Shared export (tools §6): JSON text → `{ state }` or `{ discarded: reason }`. */
export function parseSave(content: Content, json: string): { state: GameState } | { discarded: DiscardReason } {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return { discarded: 'parse' }; }
  return parseSaveValue(content, value);
}

/** Reads `tpp.save`; a discard logs `save.discarded { reason }` and starts fresh from `seed`. */
export function loadSave(content: Content, storage: Storage, log: Pick<Log, 'record'>, seed: number): LoadResult {
  const text = storage.getItem(STORAGE_KEYS.save);
  if (text === null) return { state: initialState(content, seed), source: 'fresh' };
  const parsed = parseSave(content, text);
  if ('state' in parsed) return { state: parsed.state, source: 'save' };
  log.record('save.discarded', { reason: parsed.discarded });
  return { state: initialState(content, seed), source: 'fresh', reason: parsed.discarded };
}

export type PersistenceOptions = {
  storage: Storage;
  log: SaveRecorder;
  debounceMs: number;              // content.tuning.saveDebounceMs
  wall?: () => string;             // `savedAt` clock (ISO 8601)
};

export type Persistence = {
  changed(state: GameState): void;
  flush(): void;
  attach(store: Pick<Store, 'onChange' | 'subscribe'>): () => void;
  destroy(): void;
};

const isQuota = (error: unknown) => error instanceof DOMException && error.name === 'QuotaExceededError';
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** Flush on page hide (core §8) where a DOM exists; node tests call `flush()` directly. */
function onPageHide(flush: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', hidden);
  return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
}

export function createPersistence(options: PersistenceOptions): Persistence {
  const { storage, log, debounceMs } = options;
  const wall = options.wall ?? (() => new Date().toISOString());
  let pending: GameState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const detach: (() => void)[] = [];

  const cancel = () => { clearTimeout(timer); timer = undefined; pending = undefined; };
  const flush = () => {
    const state = pending;
    cancel();
    if (!state) return;
    const json = JSON.stringify({ schemaVersion: 1, savedAt: wall(), state });
    try { storage.setItem(STORAGE_KEYS.save, json); }
    catch (error) { if (isQuota(error)) { log.recordQuota(); return; } throw error; }
    log.record('save.written', { bytes: utf8Bytes(json) });
  };
  // Bounded debounce (foundation §4.4, 250 ms): every frame's tick is a state change, so a timer reset on
  // each change would never fire during play; the first unsaved change starts the timer and later changes
  // only replace `pending`, so the latest state is written at most `debounceMs` after any change.
  const changed = (state: GameState) => { pending = state; timer ??= setTimeout(flush, debounceMs); };
  detach.push(onPageHide(flush));
  return {
    changed,
    flush,
    attach(store) {
      const offChange = store.onChange(changed);
      const offReset = store.subscribe('state.reset', () => { cancel(); storage.removeItem(STORAGE_KEYS.save); });
      const off = () => { offChange(); offReset(); };
      detach.push(off);
      return off;
    },
    destroy() { flush(); for (const off of detach.splice(0)) off(); },
  };
}
