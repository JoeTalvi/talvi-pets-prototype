import type { Content } from '../../content/types';
import type { CharmType, Item } from '../../content/schema/charms';
import type { RuleResult, SimEvent } from '../events';
import type { CharmTypeId, GameState, SlotId, TagId } from '../state';
import { slotOf } from './slots';

export type GrantSource = Extract<SimEvent, { type: 'items.granted' }>['source'];

/** MEC-004 R5/R6/R11 (DEC-043): add each item's copies in list order; a new type's key is appended (first-grant
 * order), an existing key keeps its place; one `items.granted` per item; an empty list emits nothing. */
export function grantItems(_content: Content, state: GameState, items: readonly Item[], source: GrantSource): RuleResult {
  if (items.length === 0) return { state, events: [] };
  const counts = { ...state.inventory.counts };
  const events: SimEvent[] = [];
  for (const { typeId, count } of items) {
    counts[typeId] = (counts[typeId] ?? 0) + count;
    events.push({ type: 'items.granted', typeId, count, source });
  }
  return { state: { ...state, inventory: { counts } }, events };
}

/** Copies in hand (placed copies excluded); 0 for an unknown or never-granted type. */
export function copiesOf(_content: Content, state: GameState, typeId: CharmTypeId): number {
  return Object.hasOwn(state.inventory.counts, typeId) ? state.inventory.counts[typeId] : 0;
}

/** Granted at least once: the type has a `counts` key (in hand or placed). */
export const isGranted = (state: GameState, typeId: CharmTypeId): boolean =>
  Object.hasOwn(state.inventory.counts, typeId);

/** MEC-004 R7: first-grant order, exact size class, only the current interior; zero-count types included
 * (the chooser shows them as "none left", DEC-043). */
export function chooserTypes(content: Content, state: GameState, slotId: SlotId): CharmType[] {
  const slot = slotOf(content, state, slotId); // the interior's room, or an unlocked street site (WORK-034-2)
  if (!slot) return [];
  const types = new Map(content.charms.types.map(type => [type.id, type]));
  return Object.keys(state.inventory.counts).map(id => types.get(id)!)
    .filter(type => type.sizeClass === slot.sizeClass);
}

/** Some granted type (in hand or placed) carries the tag: the want panel's `owned` availability. */
export function ownsTag(content: Content, state: GameState, tag: TagId): boolean {
  return content.charms.types.some(type => isGranted(state, type.id) && type.tags.includes(tag));
}
