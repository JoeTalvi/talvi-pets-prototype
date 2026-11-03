import { start, text, attr, image, type TemplateOptions } from './shared';

export function hudStreet(o: TemplateOptions = {}): string {
const frozen = o.state === 'frozen';
return start('hudStreet',o,frozen ? 'frozen' : '') + `<div class="tpp-project"><div class="tpp-project-label">${text(o,'content.project.name')}${text(o,'tpp.hud.progress')}</div><div class="tpp-chunks" aria-hidden="true">${[100,36,0,0,0].map(n=>`<i><b style="width:${n}%"></b></i>`).join('')}</div></div>${o.state==='no-active-project'?text(o,'tpp.hud.moreHomes','tpp-more-homes'):''}<button class="tpp-reveal-link" data-action="reveal"${frozen?' disabled':''}><span aria-hidden="true">?</span>${text(o,'tpp.hud.reveal')}</button><button type="button" class="tpp-closet-button" data-action="closet" aria-label="${attr(o,'tpp.hud.closet')}"${o.state==='frozen'?' disabled':''}>${image(o,'ui/icon-closet','tpp-closet-icon')}</button><button class="tpp-debug-entry" aria-label="Debug" data-action="debug"></button></section>`;
}
