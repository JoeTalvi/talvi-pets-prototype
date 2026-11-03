import type { AssetManifest } from '@content/schema/assets';
import type { GameState } from '@sim/state';
import { unlockedOutfitIds } from '@sim/select';
import type { ViewContext } from '@view/context';
import { createRewardCard, type RewardCard, type RewardCardContext } from '@view/celebration/rewardCard';
import { centreIn } from '@view/celebration/starsBurst';
import { CARD, SFX_VOLUMES } from '@view/celebration/timings';
import { closet, closetTile, type ClosetTile } from './templates/closet';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

/** Where a card flies when the Closet button is hidden (the button's top-right corner of the street HUD). */
export const CLOSET_FALLBACK_AT = { x: 1576, y: 52 } as const;

export type Closet = Panel & { isOpen(): boolean; open(): void; close(): void };

/** Image assets plus every avatar outfit sheet (spritesheets are not in `assetsFrom`), so tiles and cards can show frame 0. */
export function outfitAssets(manifest: AssetManifest): Record<string, string> {
  const sheets = manifest.entries.filter(e => e.type === 'spritesheet' && e.id.startsWith('player/') && e.url).map(e => [e.id, `assets/${e.url}`]);
  return { ...assetsFrom(manifest), ...Object.fromEntries(sheets) };
}

/** The Closet tiles in content order: unlocked from the selector (derived, Q16(a)), worn from `avatar.outfitId`. */
export function closetTiles(context: Pick<ViewContext, 'content'>, text: Text, state: GameState): ClosetTile[] {
  const unlocked = new Set(unlockedOutfitIds(context.content, state));
  return (context.content.outfits ?? []).map(outfit => ({ id: outfit.id, name: text(outfit.nameKey), sheet: outfit.sheet,
    unlocked: unlocked.has(outfit.id), worn: state.avatar.outfitId === outfit.id }));
}

/** Spec §6 / §10 "Outfit unlocked": the outfit's reward card face (frame 0 of its sheet, `tpp.reward.outfit`, always "New"). */
export function outfitCardFace(context: Pick<ViewContext, 'content'>, text: Text, outfitId: string) {
  const outfit = context.content.outfits.find(o => o.id === outfitId);
  if (!outfit) throw new Error(`Outfit card: unknown outfit "${outfitId}"`);
  return { kind: 'outfit', imageId: outfit.sheet, name: text('tpp.reward.outfit', { outfit: text(outfit.nameKey) }), isNew: true };
}

/**
 * WORK-037-3 gate Q13(a) arrival card: a standalone §6 card centred in the overlay — flip (`reveal` 0.7 at the flip), shimmer,
 * hold `CARD.holdMs`, then send to the Closet button. Returns the card so a reset or scene change can cancel it.
 */
export function playOutfitCard(root: HTMLElement, context: ViewContext, ctx: RewardCardContext, outfitId: string, to: () => { x: number; y: number }): RewardCard {
  const text = createText(context.content.strings);
  const card = createRewardCard(root, ctx, outfitCardFace(context, text, outfitId), { at: { x: 960, y: root.clientHeight / 2 || 540 } });
  card.el.classList.add('tpp-outfit-card');
  card.flipIn();
  context.audio?.play('reveal', { volume: SFX_VOLUMES.reveal });
  card.el.animate?.([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)' }, { filter: 'brightness(1)' }], { duration: CARD.shimmerMs, delay: CARD.flipMs });
  const sendAt = setTimeout(() => card.send(to()), CARD.flipMs + CARD.holdMs);
  const cancel = card.cancel;
  return Object.assign(card, { cancel() { clearTimeout(sendAt); cancel(); } });
}

/** Presentation §8 Closet (MEC-001, DEC-047, gate Q14(a)): opened by the street HUD's round button; choosing dispatches `chooseOutfit`. */
export function createCloset(root: HTMLElement, context: ViewContext, button: HTMLButtonElement): Closet {
  const { content, store } = context;
  const text = createText(content.strings);
  const assets = outfitAssets(context.manifest);
  root.insertAdjacentHTML('beforeend', closet({ text, assets, state: 'closed' }, []));
  const section = root.lastElementChild as HTMLElement;
  const grid = section.querySelector<HTMLElement>('.tpp-closet-grid')!;
  const render = () => { grid.innerHTML = closetTiles(context, text, store.getState()).map(t => closetTile({ text, assets }, t)).join(''); };
  const panel: Closet = {
    isOpen: () => !section.hidden,
    open() { render(); section.hidden = false; section.dataset.state = 'open'; },
    close() { section.hidden = true; section.dataset.state = 'closed'; },
    destroy() { for (const off of offs) off(); button.removeEventListener('click', onButton); cards.splice(0).forEach(c => c.cancel()); section.remove(); },
  };
  const onButton = () => { if (!button.disabled) panel.open(); };
  button.addEventListener('click', onButton);
  section.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'close') panel.close();
    else if (target.dataset.action === 'choose' && !(target as HTMLButtonElement).disabled) {
      const outfitId = target.dataset.outfitId!;
      panel.close();
      if (outfitId !== store.getState().avatar.outfitId) store.dispatch({ type: 'chooseOutfit', outfitId });
    }
  });
  // Gate Q13(a) + fork 2: the arrival grant's card waits for the open dialogue (the mate's intro) to close.
  const cards: RewardCard[] = [];
  let pending: string[] = [];
  const show = (outfitId: string) => cards.push(playOutfitCard(root, context, { content, assets, text }, outfitId,
    () => button.hidden ? CLOSET_FALLBACK_AT : centreIn(root, button)));
  const offs = [
    store.subscribe('outfit.unlocked', (event, after) => {
      if (event.source !== 'arrival') return;
      if (after.dialogue.current !== null) pending.push(event.outfitId); else show(event.outfitId);
    }),
    store.subscribe('dialogue.closed', (_event, after) => {
      if (after.dialogue.current !== null || pending.length === 0) return;
      const due = pending; pending = [];
      due.forEach(show);
    }),
    ...(['scene.changed', 'state.reset', 'mode.changed'] as const).map(type => store.subscribe(type, () => panel.close())),
    store.subscribe('state.reset', () => { pending = []; cards.splice(0).forEach(c => c.cancel()); }),
  ];
  return panel;
}
