import { escapeHtml, start, text, image, type TemplateOptions } from './shared';

export type CharmCard = { typeId: string; sprite: string; name: string; tagsHtml: string; copies: number; inert?: boolean; selected?: boolean };

/** WORK-033-2 (DEC-043, fork default 6): one chooser card, shared by the game and /tools/panels.html. A card with copies
 * shows the "×n" badge and places on click; a zero (or inert) card is greyed, says "none left" and carries no action. */
export function charmCard(o: TemplateOptions, card: CharmCard): string {
  const none = card.copies <= 0 || card.inert === true;
  const label = card.copies <= 0 ? text(o, 'tpp.chooser.noneLeft', 'tpp-charm-copies')
    : text(o, 'tpp.chooser.copies', 'tpp-charm-copies', { count: card.copies });
  const cls = ['tpp-charm-card', none ? 'none-left' : '', card.selected ? 'selected' : ''].filter(Boolean).join(' ');
  const behaviour = none ? ' aria-disabled="true"' : ' data-action="place"';
  return `<button type="button" class="${cls}"${behaviour} data-type-id="${escapeHtml(card.typeId)}" data-copies="${card.copies}">`
    + `${image(o, card.sprite)}<span class="tpp-charm-name">${escapeHtml(card.name)}</span>`
    + `<span class="tpp-tags">${card.tagsHtml}</span>${label}</button>`;
}

export function chooser(o: TemplateOptions = {}): string {
const count=o.state==='overflow'?8:5;
const name=o.text?.('content.charm.name')??'[content.charm.name]';
const tags=text(o,'content.tag.light','tpp-tag');
// The gallery's last card is a zero-count type ("none left"); the others hold one copy each.
const cards=Array.from({length:count},(_,i)=>charmCard(o,{typeId:`lamp-${i}`,sprite:'charms/lamp',name,tagsHtml:tags,copies:i===count-1?0:1,selected:o.state==='selected'&&i===0})).join('');
return start('chooser',o,'tpp-panel-layer')+`<div class="tpp-dismiss-backdrop" data-action="close"></div><div class="tpp-chooser-sheet ns-sheet"><header>${text(o,'tpp.chooser.slot','tpp-chooser-title')}${text(o,'tpp.chooser.count','tpp-muted')}</header>${o.state==='empty'?`<p class="tpp-empty">${text(o,'tpp.chooser.empty')}</p>`:`<div class="tpp-chooser-cards">${cards}</div>`}${o.state==='overflow'?text(o,'tpp.chooser.scroll','tpp-scroll-hint'):''}</div></section>`;
}
