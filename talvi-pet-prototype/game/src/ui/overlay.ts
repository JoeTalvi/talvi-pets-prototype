import type { Finding } from '@sim/checks/types';

export type OverlayContext = { findings: readonly Finding[]; lenient: boolean };

/** Dev-only QT-1(a) banner: one `ids · file:path · message` row per finding, dismissible. */
function findingsBanner(findings: readonly Finding[]): HTMLElement {
  const banner = document.createElement('aside'); banner.id = 'findings-banner';
  Object.assign(banner.style, { position: 'absolute', top: '0', left: '0', right: '0', maxHeight: '160px', overflow: 'auto', pointerEvents: 'auto',
    background: 'rgba(181, 82, 63, 0.92)', color: '#fffaf0', font: '16px/1.3 monospace', padding: '6px 56px 6px 12px', zIndex: '9' });
  const list = document.createElement('ol'); list.style.margin = '0';
  for (const f of findings) {
    const row = document.createElement('li'); row.textContent = `${f.ids.join(',')} · ${f.file}:${f.path} · ${f.message}`; list.append(row);
  }
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.dataset.action = 'dismiss'; dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss findings');
  Object.assign(dismiss.style, { position: 'absolute', top: '4px', right: '8px', fontSize: '28px', background: 'none', border: '0', color: 'inherit' });
  dismiss.addEventListener('click', () => banner.remove());
  const title = document.createElement('strong'); title.textContent = `?lenient=1 — ${findings.length} content finding(s)`;
  banner.append(title, list, dismiss);
  return banner;
}

/** The HTML layer over the canvas: safe-area probe, findings banner (lenient), `#panels` for WORK-014-2/-3. */
export function mountOverlay(root: HTMLElement, context: OverlayContext = { findings: [], lenient: false }): void {
  root.replaceChildren();
  root.style.pointerEvents = 'none';
  root.insertAdjacentHTML('beforeend', '<h1 class="tpp-sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Talvi</h1><div id="safe-area-probe"></div>');
  const panels = document.createElement('div'); panels.id = 'panels';
  Object.assign(panels.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  const grid = document.createElement('div'); grid.id = 'alignment-grid'; grid.hidden = true;
  root.append(panels, grid);
  if (context.lenient && context.findings.length) root.append(findingsBanner(context.findings));
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
