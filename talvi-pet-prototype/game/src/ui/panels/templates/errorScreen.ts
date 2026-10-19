import { start, text, button, type TemplateOptions } from './shared';

export function errorScreen(o: TemplateOptions = {}): string {
return start('errorScreen',o)+`${text(o,'tpp.error.title','tpp-heading')}<pre data-diagnostic="issues"></pre><div>${button(o,'tpp.error.reload','ns-btn-popup gold','reload')}${button(o,'tpp.error.export','ns-btn-popup secondary','export')}</div></section>`;
}
