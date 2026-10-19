/** Static markup only. WORK-014 supplies strings/assets and owns state, subscriptions and input. */
export type TemplateOptions = { state?: string; idPrefix?: string; text?: (key: string, params?: Record<string,string|number>) => string; assets?: Record<string,string> };
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const text = (o: TemplateOptions, key: string, cls = '', params?: Record<string,string|number>): string => `<span class="${escapeHtml(cls)}" data-string-key="${escapeHtml(key)}">${escapeHtml(o.text?.(key,params) ?? '[' + key + ']')}</span>`;
export const attr = (o: TemplateOptions, key: string): string => escapeHtml(o.text?.(key) ?? '[' + key + ']');
export const image = (o: TemplateOptions, id: string, cls = ''): string => o.assets?.[id] ? `<img class="${escapeHtml(cls)}" data-asset-id="${escapeHtml(id)}" src="${escapeHtml(o.assets[id])}" alt="">` : `<span class="tpp-asset-slot ${escapeHtml(cls)}" data-asset-id="${escapeHtml(id)}" aria-hidden="true"></span>`;
export const button = (o: TemplateOptions, key: string, cls = '', action = '', disabled = false): string => {
  const tintId=escapeHtml((o.idPrefix ?? 'tpp')+'-'+action+'-gold');
  const gold=cls.split(' ').includes('gold');
  const filter=gold ? `<svg class="tpp-tint-defs" width="0" height="0" aria-hidden="true"><defs><filter id="${tintId}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".91372549 0 0 0 0 0 .72941176 0 0 0 0 0 .1372549 0 0 0 0 0 1 0"/></filter></defs></svg>` : '';
  return `${filter}<button type="button" class="${escapeHtml(cls)}" data-action="${escapeHtml(action)}"${gold ? ` style="--popup-tint:url('#${tintId}')"` : ''}${disabled ? ' disabled' : ''}>${text(o,key)}</button>`;
};
export const close = (o: TemplateOptions): string => `<button type="button" class="tpp-close" data-action="close" data-string-key="tpp.common.close" aria-label="${attr(o,'tpp.common.close')}"><span aria-hidden="true">×</span></button>`;
export const start = (name: string, o: TemplateOptions, cls = ''): string => `<section class="tpp-panel tpp-${name} ${escapeHtml(cls)}" data-panel="${name}" data-state="${escapeHtml(o.state ?? 'normal')}"${o.state === 'closed' || o.state === 'hidden' || o.state === 'deferred' || o.state === 'suppressed' ? ' hidden' : ''}>`;
export const switchControl = (label: string, checked = false): string => `<button type="button" role="switch" aria-checked="${checked}" aria-label="${escapeHtml(label)}" class="ns-switch"><span class="ns-switch-track"></span><span class="ns-switch-knob"></span></button>`;
export const clueRows = (o: TemplateOptions, count: number, total = count): string => Array.from({length:total},(_,i) => `<div class="tpp-clue ${i>=count ? 'locked' : ''}"><div class="ns-tile">${i<count ? image(o,'clues/lantern') : '<span aria-hidden="true">?</span>'}</div><div>${text(o,i>=count?'tpp.reveal.locked':'tpp.reveal.phase','tpp-clue-phase',{phase:i+1})}${i<count ? text(o,'content.clue.line','tpp-clue-line') : ''}</div></div>`).join('');
