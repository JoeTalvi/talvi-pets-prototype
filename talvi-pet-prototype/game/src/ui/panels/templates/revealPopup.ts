import { start, text, image, button, clueRows, type TemplateOptions } from './shared';

export function revealPopup(o: TemplateOptions = {}): string {
return start('revealPopup',o,'tpp-panel-layer tpp-popup-backdrop')+`<div class="tpp-popup-shell ns-hero"></div><div class="tpp-mystery-tile ns-tile">${image(o,o.state==='complete'?'pets/owl-portrait':o.state==='silhouette'?'pets/owl-silhouette':'ui/mystery-shape')}</div>${text(o,o.state==='complete'?'tpp.reveal.arrived':'tpp.reveal.popupTitle','tpp-reveal-popup-title')}<div class="tpp-popup-clues">${clueRows(o,o.state==='all-clues'?5:o.state==='multiple'?3:1)}</div>${button(o,'tpp.reveal.continue','ns-btn-popup gold tpp-collect','continue')}</section>`;
}
