import { start, text, image, type TemplateOptions } from './shared';

export function chooser(o: TemplateOptions = {}): string {
const count=o.state==='overflow'?8:5;
return start('chooser',o,'tpp-panel-layer')+`<div class="tpp-dismiss-backdrop" data-action="close"></div><div class="tpp-chooser-sheet ns-sheet"><header>${text(o,'tpp.chooser.slot','tpp-chooser-title')}${text(o,'tpp.chooser.count','tpp-muted')}</header>${o.state==='empty'?`<p class="tpp-empty">${text(o,'tpp.chooser.empty')}</p>`:`<div class="tpp-chooser-cards">${Array.from({length:count},(_,i)=>`<button class="tpp-charm-card ${o.state==='selected'&&i===0?'selected':''}" data-action="place" data-item-index="${i}">${image(o,'charms/lamp')}${text(o,'content.charm.name','tpp-charm-name')}<span class="tpp-tag">${text(o,'content.tag.light')}</span></button>`).join('')}</div>`}${o.state==='overflow'?text(o,'tpp.chooser.scroll','tpp-scroll-hint'):''}</div></section>`;
}
