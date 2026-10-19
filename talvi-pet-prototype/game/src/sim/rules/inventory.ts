import type { Content } from '../../content/types';
import type { CharmType } from '../../content/schema/charms';
import type { RuleResult, SimEvent } from '../events';
import type { CharmTypeId, GameState, SlotId, TagId } from '../state';

/** MEC-004 R5: callers supply resolved ids; every grant emits once, including repeats. */
export function grantTypes(_content: Content, state: GameState, typeIds: CharmTypeId[],
  source: Extract<SimEvent, { type: 'types.unlocked' }>['source']): RuleResult {
  const owned = new Set(state.inventory.ownedTypeIds);
  const added = typeIds.filter(id => {
    if (owned.has(id)) return false;
    owned.add(id);
    return true;
  });
  return {
    state: added.length ? { ...state, inventory: { ownedTypeIds: [...owned] } } : state,
    events: [{ type: 'types.unlocked', typeIds: added, source }],
  };
}

/** MEC-004 R7: ownership order, exact size class, and only the current interior. */
export function chooserTypes(content: Content, state: GameState, slotId: SlotId): CharmType[] {
  if (state.scene.kind !== 'interior') return [];
  const slot = content.rooms[state.scene.roomId].slots.find(slot => slot.id === slotId);
  if (!slot) return [];
  const types = new Map(content.charms.types.map(type => [type.id, type]));
  return state.inventory.ownedTypeIds.map(id => types.get(id)!)
    .filter(type => type.sizeClass === slot.sizeClass);
}

export function ownsTag(content: Content, state: GameState, tag: TagId): boolean {
  const owned = new Set(state.inventory.ownedTypeIds);
  return content.charms.types.some(type => owned.has(type.id) && type.tags.includes(tag));
}
