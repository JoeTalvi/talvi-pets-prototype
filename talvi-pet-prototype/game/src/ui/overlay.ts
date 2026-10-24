import type { Finding } from '@sim/checks/types';
import type { AssetManifest } from '@content/schema/assets';
import type { ViewContext } from '@view/context';
import { createHudInterior } from './panels/hudInterior';
import { createHudStreet, type HudStreet } from './panels/hudStreet';
import { createToast, type Toast } from './panels/toast';
import { createWantPanel, type WantPanel } from './panels/wantPanel';
import { createDialogue, type Dialogue } from './panels/dialogue';
import { createChooser } from './panels/chooser';
import { createReplaceRemove } from './panels/replaceRemove';
import { createMilestonePopup, type MilestonePopup } from './panels/milestonePopup';
import { createRevealPopup, type RevealPopup } from './panels/revealPopup';
import { createDebugPanel, type DebugPanel } from './panels/debugPanel';
import { createRoomEditorPanel, type RoomEditorPanel } from './panels/roomEditor';

export type OverlayContext = { findings: readonly Finding[]; lenient: boolean };
export type TextParams = Record<string, string | number>;
export type Text = (key: string, params?: TextParams) => string;
/** The panel module API WORK-014-3/-4 and WORK-019/020 follow. */
export type Panel = { open?(slotId: string): void; close?(reason?: string): void; destroy(): void };
export type Panels = { hudInterior: Panel; hudStreet: HudStreet; toast: Toast; wantPanel: WantPanel; dialogue: Dialogue; chooser: Panel; replaceRemove: Panel;
  milestonePopup: MilestonePopup; revealPopup: RevealPopup; debugPanel: DebugPanel; roomEditor: RoomEditorPanel };

/** UI strings a lane proposed that `strings.json` does not carry yet; emptied by WORK-021-1's strings merge (every key now resolves from `strings.json`). */
export const FALLBACK_STRINGS: Readonly<Record<string, string>> = {};

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

/** Presentation §8: mounted once at startup in z-order HUD < toast < want panel, dialogue < chooser < sheet < popups (5) < debug (6); the sheet's Replace reaches the chooser through the bus. */
export function mountPanels(panels: HTMLElement, context: ViewContext): Panels {
  // Order fork 5: hudStreet mounts before debugPanel so its mount-time `.tpp-debug-entry` scan binds the street entry once.
  const hudInterior = createHudInterior(panels, context), hudStreet = createHudStreet(panels, context), toast = createToast(panels, context), wantPanel = createWantPanel(panels, context);
  const dialogue = createDialogue(panels, context);
  const chooser = createChooser(panels, context), replaceRemove = createReplaceRemove(panels, context);
  // WORK-020-3 order fork 3: the reveal popup opens after the milestone popup's collect animation has hidden it.
  const milestonePopup = createMilestonePopup(panels, context), revealPopup = createRevealPopup(panels, context, milestonePopup);
  return { hudInterior, hudStreet, toast, wantPanel, dialogue, chooser, replaceRemove, milestonePopup, revealPopup, debugPanel: createDebugPanel(panels, context), roomEditor: createRoomEditorPanel(panels, context) };
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
