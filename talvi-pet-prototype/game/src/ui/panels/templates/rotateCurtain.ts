import { start, text, type TemplateOptions } from './shared';

export function rotateCurtain(o: TemplateOptions = {}): string {
return start('rotateCurtain',o)+`<div class="tpp-rotate-phone" aria-hidden="true">↻</div>${text(o,'tpp.rotate.title','tpp-heading')}</section>`;
}
