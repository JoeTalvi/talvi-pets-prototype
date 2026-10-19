import { start, text, type TemplateOptions } from './shared';

export function toast(o: TemplateOptions = {}): string {
return start('toast',o,'ns-toast')+`${text(o,'tpp.toast.delta','tpp-toast-delta')}${text(o,'tpp.toast.roundup')}</section>`;
}
