import { start, text, attr, image, close, clueRows, type TemplateOptions } from './shared';

export function revealPanel(o: TemplateOptions = {}): string {
return start('revealPanel',o,'tpp-panel-layer tpp-dim-backdrop')+`<div class="tpp-dismiss-backdrop" data-action="close"></div><div class="tpp-reveal-panel ns-modal">${close(o)}<div class="tpp-reveal-image">${image(o,o.state==='arrived'?'pets/owl-portrait':'ui/mystery-shape')}</div><div class="tpp-reveal-info">${text(o,'tpp.reveal.panelTitle','tpp-reveal-label')}${clueRows(o,o.state==='locked'?0:o.state==='arrived'?5:2,5)}<label class="tpp-guess-label">${text(o,'tpp.reveal.guessLabel')}<input maxlength="40" data-string-key="tpp.reveal.guessPlaceholder" placeholder="${attr(o,'tpp.reveal.guessPlaceholder')}"${o.state==='guess'?` value="${attr(o,'content.reveal.guess')}" data-value-string-key="content.reveal.guess"`:''}></label></div></div></section>`;
}
