import { start, text, attr, image, close, escapeHtml, type TemplateOptions } from './shared';

/** One Closet tile (WORK-037-3, DEC-047): an unlocked outfit shows its sheet's idle-down frame 0 (CSS crop) and name; locked is a mystery shape. */
export type ClosetTile = { id: string; name: string; sheet: string; unlocked: boolean; worn: boolean };

export const closetTile = (o: TemplateOptions, t: ClosetTile): string => t.unlocked
  ? `<button type="button" class="ns-tile tpp-closet-tile${t.worn ? ' selected' : ''}" data-action="choose" data-outfit-id="${escapeHtml(t.id)}" aria-pressed="${t.worn}" aria-label="${escapeHtml(t.name)}">${image(o, t.sheet, 'tpp-outfit-face')}<span class="tpp-closet-name">${escapeHtml(t.name)}</span></button>`
  : `<button type="button" class="ns-tile tpp-closet-tile locked" data-outfit-id="${escapeHtml(t.id)}" disabled aria-label="?">${image(o, 'ui/mystery-shape', 'tpp-closet-mystery')}<span class="tpp-closet-name" aria-hidden="true">?</span></button>`;

/** Preview states for tools/panels.html (content order default / cosy / garden; placeholder names). */
const SHEETS = [['default', 'Everyday', 'player/avatar-sheet'], ['cosy', 'Cosy set', 'player/avatar-cosy-sheet'], ['garden', 'Garden set', 'player/avatar-garden-sheet']] as const;
function previewTiles(state: string | undefined): ClosetTile[] {
  const unlocked = state === 'one-unlocked' ? 1 : state === 'two-unlocked' ? 2 : 3;
  const worn = state === 'all-three-garden-worn' ? 'garden' : 'default';
  return SHEETS.map(([id, name, sheet], i) => ({ id, name, sheet, unlocked: i < unlocked, worn: id === worn }));
}

/** MEC-001 Closet picker (presentation §8 new panel, gate Q14(a)): a modal with three tiles, ✕ and backdrop close. */
export function closet(o: TemplateOptions = {}, tiles: ClosetTile[] = previewTiles(o.state)): string {
  return start('closet', o, 'tpp-panel-layer tpp-dim-backdrop') + `<div class="tpp-dismiss-backdrop" data-action="close"></div><div class="tpp-closet-panel ns-modal" role="dialog" aria-label="${attr(o, 'tpp.hud.closet')}">${close(o)}${text(o, 'tpp.hud.closet', 'tpp-closet-title')}<div class="tpp-closet-grid">${tiles.map(t => closetTile(o, t)).join('')}</div></div></section>`;
}
