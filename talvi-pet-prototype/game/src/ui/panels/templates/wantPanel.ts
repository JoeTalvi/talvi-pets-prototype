import { start, text, type TemplateOptions } from './shared';

export function wantPanel(o: TemplateOptions = {}): string {
 const state=o.state??'a',fulfilled=state==='d'||state==='fulfilled';
 const tag=(key:string,met=false,unavailable=false)=>`<span class="tpp-tag ${met?'done':''} ${unavailable?'unavailable':''}"><span aria-hidden="true">${met?'✓':'☐'}</span> ${text(o,key)}</span>`;
 const conditions=state==='a'?tag('content.tag.soft')+tag('content.tag.seat'):state==='c'?tag('content.tag.plant',true)+tag('tpp.want.hidden')+`<span class="tpp-tag wide">${text(o,'tpp.want.starsFloor')}</span>`:tag('content.tag.light',true)+tag('content.tag.plant',fulfilled,state==='b')+tag('tpp.want.adjacent',fulfilled);
 return start('wantPanel',o,state==='dim'?'dim':'')+`${text(o,'tpp.want.title','tpp-want-title')}${text(o,state==='exhausted'?'tpp.wants.exhausted':'content.want.brief','tpp-want-brief')}${state==='exhausted'?'':`<div class="tpp-tags">${conditions}</div>${state==='b'||fulfilled?text(o,fulfilled?'tpp.want.fulfilledFlash':'tpp.want.availability.nextPhase','tpp-want-note'):''}<div class="tpp-want-reward">${text(o,'tpp.want.rewardPrefix')} ${text(o,'content.want.reward')}</div>`}</section>`;
}
