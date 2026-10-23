import type { GameState } from '@sim/state';
import { starsOf } from '@sim/select';
import type { ViewContext } from '@view/context';
import { hudInterior } from './templates/hudInterior';
import { assetsFrom, createText, type Panel } from '../overlay';

const RENDER_ON = ['mode.changed', 'stars.changed', 'stars.visibilityChanged', 'heart.earned', 'dialogue.opened', 'dialogue.closed',
  'scene.changed', 'state.reset', 'charm.placed', 'charm.removed'] as const;

/** Presentation §8.2 `hudInterior`: the Decorate/Done toggle (Q14(b)), the static Stars bar and Hearts; visible in the Interior only. */
export function createHudInterior(root: HTMLElement, context: ViewContext): Panel {
  const { content, store } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', hudInterior({ text, assets: assetsFrom(context.manifest), idPrefix: 'hud' }));
  const section = root.lastElementChild as HTMLElement;
  const toggle = section.querySelector<HTMLButtonElement>('.tpp-design-toggle')!;
  const label = toggle.querySelector<HTMLElement>('[data-string-key]')!;
  const stars = section.querySelector<HTMLElement>('.tpp-stars')!;
  const starsLabel = stars.querySelector<HTMLElement>('[data-string-key="tpp.stars.label"]')!;
  const fill = stars.querySelector<HTMLElement>('.tpp-stars-track i')!;
  const hearts = section.querySelector<HTMLElement>('.tpp-hearts')!;

  const render = (state: GameState) => {
    section.hidden = state.scene.kind !== 'interior';
    if (state.scene.kind !== 'interior') return;
    const design = state.mode === 'design';
    section.classList.toggle('dim', design);
    const key = design ? 'tpp.hud.done' : 'tpp.hud.decorate';
    label.dataset.stringKey = key; label.textContent = text(key);
    toggle.classList.toggle('ns-btn-primary', !design); toggle.classList.toggle('ns-btn-secondary', design);
    toggle.disabled = state.dialogue.current !== null;
    const room = content.rooms[state.scene.roomId];
    const { points, max } = starsOf(content, state, room.id);
    stars.hidden = !state.session.starsVisible;
    starsLabel.textContent = text('tpp.stars.label', { stars: points, max });
    fill.style.width = `${max > 0 ? Math.min(100, (points / max) * 100) : 0}%`;
    hearts.textContent = text('tpp.hud.hearts', { hearts: state.pets[room.residentPetId]?.hearts ?? 0 });
  };
  const onToggle = () => store.dispatch({ type: 'setDesignMode', on: store.getState().mode !== 'design' });
  toggle.addEventListener('click', onToggle);
  const offs = RENDER_ON.map(type => store.subscribe(type, (_event, after) => render(after)));
  render(store.getState());
  return {
    destroy() { for (const off of offs) off(); toggle.removeEventListener('click', onToggle); section.remove(); },
  };
}
