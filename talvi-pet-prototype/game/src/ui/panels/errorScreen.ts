import { STORAGE_KEYS } from '@app/log';
import { pointer } from '@content/types';
import { errorScreen } from './templates';
import { textFor } from '../text';

export function showError(message: string): void {
  const overlay = document.getElementById('overlay'); if (overlay) overlay.replaceChildren();
  const screen = document.createElement('section'); screen.id = 'error-screen';
  const title = document.createElement('h1'); title.dataset.stringKey = 'tpp.error.title'; title.textContent = 'Talvi could not start';
  const detail = document.createElement('p'); detail.textContent = message;
  screen.append(title, detail); document.body.append(screen);
  console.error('app.error', message);
}

/** A loader issue (`path` as segments) or a check finding (`path` as a JSON pointer). */
export type ErrorLine = { file: string; path: string | readonly (string | number)[]; ids?: readonly string[]; message: string };

/** One `file:/pointer [ids] message` line per issue. */
export function errorLines(lines: readonly ErrorLine[]): string {
  return lines.map(l => {
    const path = typeof l.path === 'string' ? l.path : pointer(l.path);
    return `${l.file}:${path}${l.ids?.length ? ` [${l.ids.join(', ')}]` : ''} ${l.message}`;
  }).join('\n');
}

/** `tpp-error-<YYYY-MM-DD>T<HHMM>.txt` from the wall clock. */
export function errorExportFilename(wallIso: string): string {
  return `tpp-error-${wallIso.slice(0, 10)}T${wallIso.slice(11, 13)}${wallIso.slice(14, 16)}.txt`;
}

function exportIssues(issues: string, storage: Storage, wall: () => string): void {
  let mirror = '';
  try { mirror = storage.getItem(STORAGE_KEYS.log) ?? ''; } catch (error) { console.error('app.error', 'log mirror unreadable', error); }
  const url = URL.createObjectURL(new Blob([`${issues}\n\n--- ${STORAGE_KEYS.log} ---\n${mirror}`], { type: 'text/plain' }));
  const anchor = Object.assign(document.createElement('a'), { href: url, download: errorExportFilename(wall()) });
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Presentation §8.2 `errorScreen`: WORK-011's template with the issue list, Reload and Export. */
export function showContentError(lines: readonly ErrorLine[], options: { storage?: Storage; wall?: () => string; reload?: () => void } = {}): HTMLElement {
  const overlay = document.getElementById('overlay'); if (overlay) overlay.replaceChildren();
  const holder = document.createElement('div');
  holder.innerHTML = errorScreen({ text: textFor() });
  const screen = holder.firstElementChild as HTMLElement;
  screen.id = 'error-screen';
  const issues = errorLines(lines);
  screen.querySelector('pre[data-diagnostic="issues"]')!.textContent = issues;
  screen.querySelector('[data-action="reload"]')!.addEventListener('click', () => (options.reload ?? (() => location.reload()))());
  screen.querySelector('[data-action="export"]')!.addEventListener('click', () =>
    exportIssues(issues, options.storage ?? localStorage, options.wall ?? (() => new Date().toISOString())));
  document.body.append(screen);
  console.error('app.error', issues);
  return screen;
}
