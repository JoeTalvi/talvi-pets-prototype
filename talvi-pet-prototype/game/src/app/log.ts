import type { SimEvent } from '@sim/events';
import type { GameState } from '@sim/state';

/** TECH-011 / mec-010 §5 event log: JSONL ring mirrored to `tpp.log`, controller records, export. */
export const STORAGE_KEYS = { save: 'tpp.save', log: 'tpp.log' } as const;

export type LogLine = { t: number; wall: string; type: string; [k: string]: unknown };

/** Core §3 controller-level records (not bus events; never pass through `reduce`). */
export const CONTROLLER_RECORD_TYPES = [
  'session.started', 'save.written', 'save.discarded', 'save.loaded', 'log.exported', 'log.quota',
  'input.tap', 'input.drag', 'input.joystick', 'asset.loadError', 'audio.locked', 'app.error',
  'ui.revealPanel', 'ui.debugPanel', 'ui.chooserOpened', 'ui.chooserClosed', 'ui.sheetOpened',
  'ui.sheetClosed', 'ui.bubbleTapped', 'ui.rewardTile', 'ui.wantPanel', 'ui.starsExplained',
  'ui.rotateCurtain', 'ui.revealCard', 'ui.roomEditor', 'ui.preview', 'perf.sample',
] as const;
export type ControllerRecordType = typeof CONTROLLER_RECORD_TYPES[number];

/** `session.started` payload, built by the caller (core §3). */
export type SessionHeader = {
  build: string; schemaVersion: 1; seed: number; cadence: number | null;
  feedPresentation: 'events' | 'trickle'; testerLabel: string; userAgent: string;
  viewport: { w: number; h: number; dpr: number };
};

export type ExportMethod = 'download' | 'copy' | 'share';
export type Exporter = (text: string, filename: string) => Promise<void>;

export type LogOptions = {
  storage: Storage;
  ringLines: number;               // content.tuning.logRingLines
  now?: () => number;              // monotonic ms (performance.now)
  wall?: () => string;             // ISO 8601 with ms
  mirrorEveryMs?: number;          // mec-010 §10: at most one mirror write per second
  exporters?: Partial<Record<ExportMethod, Exporter>>;
};

type Subscribable = { subscribeAll(fn: (event: SimEvent, stateAfter: GameState) => void): () => void };

export type Log = {
  start(header: SessionHeader): void;
  record(type: ControllerRecordType, payload?: Record<string, unknown>): void;
  recordQuota(): void;
  attach(store: Subscribable): () => void;
  lines(): LogLine[];
  flush(): void;
  reset(header: SessionHeader): void;
  exportLog(method: ExportMethod): Promise<void>;
  destroy(): void;
};

const isQuota = (error: unknown) => error instanceof DOMException && error.name === 'QuotaExceededError';

/** Lines surviving from an earlier session's mirror; an unreadable line is skipped. */
function readMirror(storage: Storage): LogLine[] {
  const text = storage.getItem(STORAGE_KEYS.log);
  if (!text) return [];
  return text.split('\n').flatMap(line => {
    try { return [JSON.parse(line) as LogLine]; } catch { return []; }
  });
}

/** `tpp-log-<YYYY-MM-DD>T<HHMM>.jsonl` from the wall clock (mec-010 §5.3). */
export function exportFilename(wallIso: string): string {
  return `tpp-log-${wallIso.slice(0, 10)}T${wallIso.slice(11, 13)}${wallIso.slice(14, 16)}.jsonl`;
}

function domExporters(): Record<ExportMethod, Exporter> {
  const file = (text: string, name: string) => new File([text], name, { type: 'application/x-ndjson' });
  return {
    async download(text, filename) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
      const anchor = Object.assign(document.createElement('a'), { href: url, download: filename });
      anchor.click();
      URL.revokeObjectURL(url);
    },
    copy: text => navigator.clipboard.writeText(text),
    async share(text, filename) {
      const files = [file(text, filename)];
      if (!navigator.canShare?.({ files })) throw new Error('Sharing files is not available on this device.');
      await navigator.share({ files });
    },
  };
}

export function createLog(options: LogOptions): Log {
  const { storage, ringLines, mirrorEveryMs = 1000 } = options;
  const now = options.now ?? (() => performance.now());
  const wall = options.wall ?? (() => new Date().toISOString());
  const exporters = { ...domExporters(), ...options.exporters };
  let ring: LogLine[] = [];
  let origin = now();
  let lastMirror = -Infinity;
  let quotaSeen = false;
  const detach = new Set<() => void>();

  const append = (type: string, payload: Record<string, unknown> = {}) => {
    ring.push({ t: Math.max(0, Math.round(now() - origin)), wall: wall(), type, ...payload });
    if (ring.length > ringLines) ring.splice(0, ring.length - ringLines);
    if (now() - lastMirror >= mirrorEveryMs) writeMirror();
  };
  const recordQuota = () => { if (!quotaSeen) { quotaSeen = true; append('log.quota'); } };
  const writeMirror = () => {
    lastMirror = now();
    try { storage.setItem(STORAGE_KEYS.log, ring.map(line => JSON.stringify(line)).join('\n')); }
    catch (error) { if (isQuota(error)) recordQuota(); else throw error; }
  };
  const begin = (header: SessionHeader) => { origin = now(); append('session.started', header); };

  return {
    start(header) { ring = readMirror(storage).slice(-ringLines); begin(header); },
    record: (type, payload) => append(type, payload),
    recordQuota,
    attach(store) {
      const off = store.subscribeAll(event => append(event.type, { ...event }));
      detach.add(off);
      return () => { off(); detach.delete(off); };
    },
    lines: () => ring.slice(),
    flush: writeMirror,
    reset(header) { ring = []; storage.removeItem(STORAGE_KEYS.log); lastMirror = -Infinity; begin(header); },
    async exportLog(method) {
      const exported = ring.slice();
      try { await exporters[method](exported.map(line => JSON.stringify(line)).join('\n'), exportFilename(wall())); }
      catch (error) {
        append('app.error', { message: `log export (${method}) failed: ${String(error)}`, stack: (error as Error)?.stack ?? '' });
        throw error;
      }
      append('log.exported', { method, lines: exported.length });
    },
    destroy() { for (const off of detach) off(); detach.clear(); writeMirror(); },
  };
}

/* Spike compatibility (WORK-001): `src/main.ts` and the spike scenes import `log`/`logs` until
 * WORK-014 deletes the spike. Behaviour is the spike's own; new code uses `createLog`. */
export const logs: { type: string; t: number; [key: string]: unknown }[] = [];
export function log(type: string, fields: Record<string, unknown> = {}): void {
  const line = { type, t: performance.now(), ...fields };
  logs.push(line);
  if (logs.length > 5000) logs.shift();
  console.info(JSON.stringify(line));
}
