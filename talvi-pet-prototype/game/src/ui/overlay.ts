export function mountOverlay(root: HTMLElement): void {
  root.innerHTML = `<div id="safe-area-probe"></div><div class="safe-hud"><section class="ns-modal spike-panel"><h1>Talvi · Integration room</h1><p>Walk with arrows, WASD or the stick. Walk into the marked doorway to visit the street.</p><button class="ns-btn-primary" id="sound">Play sound</button><details><summary>Spike diagnostics</summary><label><input id="grid-toggle" type="checkbox"> Alignment grid</label><label>Focus check <input id="focus-check" placeholder="Type here"></label><output id="spike-status"></output></details></section></div><div id="alignment-grid" hidden></div><aside id="rotate-curtain">Rotate your phone to play</aside>`;
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
