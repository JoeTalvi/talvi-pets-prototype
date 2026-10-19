import { start, text, attr, button, type TemplateOptions } from './shared';

export function hudInterior(o: TemplateOptions = {}): string {
const dim = o.state === 'dim';
return start('hudInterior',o,dim?'dim':'') + `<div class="tpp-interior-pill"><div class="tpp-stars"${o.state==='stars-hidden'?' hidden':''}><div class="tpp-stars-track" aria-hidden="true"><i></i></div>${text(o,'tpp.stars.label')}${o.state==='delta'?text(o,'tpp.stars.delta','tpp-stars-delta'):''}</div>${text(o,'tpp.hud.hearts','tpp-hearts')}</div>${button(o,dim?'tpp.hud.done':'tpp.hud.decorate',`tpp-design-toggle ns-btn-${dim?'secondary':'primary'}`,'decorate',o.state==='dialogue-disabled')}<button class="tpp-debug-entry" aria-label="Debug" data-action="debug"></button>${o.state==='attention'?`<button class="tpp-attention" data-action="attention" data-string-key="tpp.hud.attention" aria-label="${attr(o,'tpp.hud.attention')}">!</button>`:''}${o.state==='explained'?`<aside class="tpp-stars-explained ns-tooltip">${text(o,'tpp.stars.explain')}</aside>`:''}</section>`;
}
