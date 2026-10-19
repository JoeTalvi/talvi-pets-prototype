import { start, text, image, type TemplateOptions } from './shared';

export function dialogue(o: TemplateOptions = {}): string {
const game=o.state==='game'||o.state==='game-text-proposal';
return start('dialogue',o,`tpp-panel-layer ${o.state==='game-text-proposal'?'text-only-proposal':''}`)+`<div class="tpp-dialogue-backdrop" data-action="advance"></div><div class="tpp-dialogue-box" data-action="advance">${o.state==='game-text-proposal'?'':`<div class="tpp-portrait">${image(o,game?'ui/game-portrait':'pets/dog-portrait')}</div>`}<div class="tpp-dialogue-copy">${text(o,game?'tpp.dialogue.gameName':'content.pet.name','tpp-speaker')}${text(o,'content.dialogue.line','tpp-dialogue-line')}</div>${text(o,'tpp.dialogue.continue','tpp-continue')}</div></section>`;
}
