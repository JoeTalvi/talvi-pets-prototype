import { start, text, image, type TemplateOptions } from './shared';

export function dialogue(o: TemplateOptions = {}): string {
// APPROVAL-006: game narration is text-only. Keep the old review state as an accepted alias.
const game=o.state==='game'||o.state==='game-text-proposal';
return start('dialogue',o,`tpp-panel-layer ${game?'text-only-game':''}`)+`<div class="tpp-dialogue-backdrop" data-action="advance"></div><div class="tpp-dialogue-box" data-action="advance">${game?'':`<div class="tpp-portrait">${image(o,'pets/dog-portrait')}</div>`}<div class="tpp-dialogue-copy">${text(o,game?'tpp.dialogue.gameName':'content.pet.name','tpp-speaker')}${text(o,'content.dialogue.line','tpp-dialogue-line')}</div>${text(o,'tpp.dialogue.continue','tpp-continue')}</div></section>`;
}
