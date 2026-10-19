import { start, text, image, button, close, type TemplateOptions } from './shared';

export function replaceRemove(o: TemplateOptions = {}): string {
return start('replaceRemove',o)+`${image(o,'charms/lamp')}${text(o,'content.charm.name','tpp-sheet-name')}<span class="tpp-tag">${text(o,'content.tag.light')}</span>${close(o)}<div class="tpp-sheet-actions">${button(o,'tpp.sheet.replace','tpp-flat-button','replace')}${button(o,'tpp.sheet.remove','tpp-flat-button','remove')}</div></section>`;
}
