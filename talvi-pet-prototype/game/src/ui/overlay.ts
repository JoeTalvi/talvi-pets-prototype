import type { Finding } from '@sim/checks/types';
import type { AssetManifest } from '@content/schema/assets';
import type { ViewContext } from '@view/context';
import { createHudInterior } from './panels/hudInterior';
import { createChooser } from './panels/chooser';
import { createReplaceRemove } from './panels/replaceRemove';
import { createDebugPanel, type DebugPanel } from './panels/debugPanel';

export type OverlayContext = { findings: readonly Finding[]; lenient: boolean };
export type TextParams = Record<string, string | number>;
export type Text = (key: string, params?: TextParams) => string;
/** The panel module API WORK-014-3/-4 and WORK-019/020 follow. */
export type Panel = { open?(slotId: string): void; close?(reason?: string): void; destroy(): void };
export type Panels = { hudInterior: Panel; chooser: Panel; replaceRemove: Panel; debugPanel: DebugPanel };

/** UI strings WORK-011 proposed that `strings.json` does not carry yet (returned to WORK-021 as strings-additions.json). */
export const FALLBACK_STRINGS: Readonly<Record<string, string>> = {
  'tpp.chooser.slot': '{size} slot',
  'tpp.chooser.size.small': 'Small floor',
  'tpp.chooser.size.large': 'Large floor',
  'tpp.chooser.size.wall': 'Wall',
  'tpp.chooser.count': '{count} charms you own',
  'tpp.chooser.scroll': '▸ scroll',
  'tpp.common.close': 'Close',
  'tpp.hud.hearts': '♥ {hearts}',
};

/** `content.strings[key]` first, then the fallback table, with `{param}` substitution; `[key]` when unresolved. */
export function createText(strings: Readonly<Record<string, string>>): Text {
  return (key, params = {}) => {
    const raw = strings[key] ?? FALLBACK_STRINGS[key];
    if (raw === undefined) return `[${key}]`;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
  };
}

/** Template `assets` map: `id → assets/<url>` for every image row of the manifest. */
export function assetsFrom(manifest: AssetManifest): Record<string, string> {
  return Object.fromEntries(manifest.entries.filter(e => e.type === 'image' && e.url).map(e => [e.id, `assets/${e.url}`]));
}

/** Dev-only QT-1(a) banner: one `ids · file:path · message` row per finding, dismissible. */
function findingsBanner(findings: readonly Finding[]): HTMLElement {
  const banner = document.createElement('aside'); banner.id = 'findings-banner';
  Object.assign(banner.style, { position: 'absolute', top: '0', left: '0', right: '0', maxHeight: '160px', overflow: 'auto', pointerEvents: 'auto',
    background: 'rgba(181, 82, 63, 0.92)', color: '#fffaf0', font: '16px/1.3 monospace', padding: '6px 56px 6px 12px', zIndex: '9' });
  const list = document.createElement('ol'); list.style.margin = '0';
  for (const f of findings) {
    const row = document.createElement('li'); row.dataset.level = f.level; row.textContent = `${f.ids.join(',')} · ${f.file}:${f.path} · ${f.message}`; list.append(row);
  }
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.dataset.action = 'dismiss'; dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss findings');
  Object.assign(dismiss.style, { position: 'absolute', top: '4px', right: '8px', fontSize: '28px', background: 'none', border: '0', color: 'inherit' });
  dismiss.addEventListener('click', () => banner.remove());
  const title = document.createElement('strong'); const errors = findings.filter(f => f.level === 'error').length;
  title.textContent = `?lenient=1 — ${errors} error(s), ${findings.length - errors} other finding(s)`;
  banner.append(title, list, dismiss);
  return banner;
}

/** Presentation §8: mounted once at startup in z-order HUD < chooser < sheet < debug (6); the sheet's Replace reaches the chooser through the bus. */
export function mountPanels(panels: HTMLElement, context: ViewContext): Panels {
  const hudInterior = createHudInterior(panels, context), chooser = createChooser(panels, context), replaceRemove = createReplaceRemove(panels, context);
  return { hudInterior, chooser, replaceRemove, debugPanel: createDebugPanel(panels, context) };
}

/** The HTML layer over the canvas: safe-area probe, findings banner (lenient), `#panels` (mounted when given a full ViewContext). */
export function mountOverlay(root: HTMLElement, context: OverlayContext | ViewContext = { findings: [], lenient: false }): Panels | null {
  root.replaceChildren();
  root.style.pointerEvents = 'none';
  root.insertAdjacentHTML('beforeend', '<h1 class="tpp-sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Talvi</h1><div id="safe-area-probe"></div>');
  const panels = document.createElement('div'); panels.id = 'panels';
  Object.assign(panels.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  const grid = document.createElement('div'); grid.id = 'alignment-grid'; grid.hidden = true;
  root.append(panels, grid);
  if (context.lenient && context.findings.length) root.append(findingsBanner(context.findings));
  return 'store' in context ? mountPanels(panels, context) : null;
}

export function setAlignmentGrid(root: HTMLElement, enabled: boolean): void {
  const grid = root.querySelector<HTMLElement>('#alignment-grid'); if (!grid) return;
  grid.hidden = !enabled; grid.replaceChildren();
  if (!enabled) return;
  for (const [name, x, y] of [['tl', 0, 0], ['tr', 100, 0], ['bl', 0, 100], ['br', 100, 100], ['centre', 50, 50]] as const) {
    const target = document.createElement('button'); target.className = 'alignment-target'; target.dataset.corner = name; target.ariaLabel = `Alignment ${name}`;
    Object.assign(target.style, { left: `${x}%`, top: `${y}%` }); target.addEventListener('click', () => { target.dataset.hit = 'true'; }); grid.append(target);
  }
}
