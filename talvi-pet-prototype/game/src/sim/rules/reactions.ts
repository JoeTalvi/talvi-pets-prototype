import type { CharmType } from '../../content/schema/charms';
import type { Pet, Want } from '../../content/schema/pet';
import type { Content } from '../../content/types';
import type { RuleResult, SimEvent } from '../events';
import type { CharmTypeId, GameState, PetBehaviour, PetId, Reaction, SlotId, TagId, VerbId } from '../state';
import { petPick, phaseChanged, toIdle, withBehaviour } from './petBehaviour';
import type { PlacementChange } from './slots';
import { activeWant, hiddenTagOf } from './wants';

export function typeOf(content: Content, typeId: CharmTypeId): CharmType {
  const type = content.charms.types.find(candidate => candidate.id === typeId);
  if (!type) throw new Error(`Unknown charm type ${typeId}`);
  return type;
}

/** MEC-007 §2.5, one authoritative ladder: love > dislike > like > none (core §8 priority). */
export function ladderFor(_content: Content, pet: Pet, type: CharmType, want: Want | null): Reaction | 'none' {
  const hidden = want ? hiddenTagOf(want) : null;
  const top = Math.max(...pet.likes.map(like => like.weight));
  const weightOf = (tag: TagId) => pet.likes.find(like => like.tag === tag)?.weight;
  if (type.tags.some(tag => tag === hidden || weightOf(tag) === top)) return 'love';
  if (type.tags.some(tag => pet.dislikes.includes(tag))) return 'dislike';
  return type.tags.some(tag => weightOf(tag) !== undefined) ? 'like' : 'none';
}

/** `verbs.json` tag → verb (a tag maps to at most one verb, CHK-007-01). */
export function verbOfTag(content: Content, tag: TagId): VerbId | null {
  return content.verbs.find(verb => verb.tags.includes(tag))?.id ?? null;
}

/** MEC-007 §2.6: the verb of the highest-weight liked tag the pet has (ties: `type.tags` order),
 * else the verb of any tag the pet has, else null. */
export function verbFor(content: Content, type: CharmType, pet: Pet, verbs: readonly VerbId[]): VerbId | null {
  const available = (tag: TagId) => {
    const verb = verbOfTag(content, tag);
    return verb !== null && verbs.includes(verb) ? verb : null;
  };
  let best: { weight: number; verb: VerbId } | null = null;
  for (const tag of type.tags) {
    const weight = pet.likes.find(like => like.tag === tag)?.weight;
    const verb = available(tag);
    if (weight !== undefined && verb !== null && (best === null || weight > best.weight)) best = { weight, verb };
  }
  return best?.verb ?? type.tags.map(available).find(verb => verb !== null) ?? null;
}

export function usingSlotOf(behaviour: PetBehaviour): SlotId | null {
  return behaviour.phase === 'using' && behaviour.target !== null && 'slotId' in behaviour.target
    ? behaviour.target.slotId : null;
}

/** `pet.verbEnded` for a pet leaving `using` (empty otherwise). */
export function verbEndedOf(petId: PetId, behaviour: PetBehaviour): SimEvent[] {
  const slotId = usingSlotOf(behaviour);
  return slotId !== null && behaviour.verb !== null ? [{ type: 'pet.verbEnded', petId, verb: behaviour.verb, slotId }] : [];
}

type Placement = { content: Content; petId: PetId; slotId: SlotId; typeId: CharmTypeId; replacing: boolean };

/** love / like: the walk-over overrides any phase (MEC-007 §2.3 row 1). */
function walkOver(at: Placement, state: GameState, reaction: 'love' | 'like'): RuleResult {
  const { content, petId, slotId, typeId } = at;
  const pet = state.pets[petId];
  const before = pet.behaviour;
  const verb = verbFor(content, typeOf(content, typeId), content.pets[petId], pet.verbs);
  const next: PetBehaviour = { ...before, phase: 'walking', timerMs: 0, target: { slotId }, verb, reaction };
  return { state: withBehaviour(state, petId, next), events: [...verbEndedOf(petId, before),
    { type: 'pet.reacted', petId, reaction, slotId, typeId, line: null, walkOver: true },
    phaseChanged(petId, before.phase, next)] };
}

/** dislike: bubble always; `reacting` only from idle (or after a replaced verb). */
function dislike(at: Placement, state: GameState): RuleResult {
  const { content, petId, slotId, typeId } = at;
  const before = state.pets[petId].behaviour;
  const pick = petPick(state, petId, content.pets[petId].lines.dislike);
  const events: SimEvent[] = [...(at.replacing ? verbEndedOf(petId, before) : []),
    { type: 'pet.reacted', petId, reaction: 'dislike', slotId, typeId, line: pick.item, walkOver: false }];
  if (before.phase !== 'idle' && !at.replacing) return { state: pick.state, events };
  const next: PetBehaviour = { ...before, phase: 'reacting', timerMs: content.tuning.bubbleMs,
    target: { slotId }, verb: null, reaction: 'dislike' };
  return { state: withBehaviour(pick.state, petId, next), events: [...events, phaseChanged(petId, before.phase, next)] };
}

/** none: nothing, unless the pet was using the replaced charm (then idle, no 🤔). */
function noReaction(at: Placement, state: GameState): RuleResult {
  if (!at.replacing) return { state, events: [] };
  const before = state.pets[at.petId].behaviour;
  const idle = toIdle(at.content, state, at.petId);
  return { state: withBehaviour(idle.state, at.petId, idle.behaviour),
    events: [...verbEndedOf(at.petId, before), phaseChanged(at.petId, before.phase, idle.behaviour)] };
}

/** MEC-007 §2.3 placement link (core §6.1, after wants): exactly one `pet.reacted` at most;
 * a fulfilment in this dispatch replaces the ladder with ❤️ at `focusSlotId` (core §6.2). */
export function afterPlacement(content: Content, before: GameState, current: GameState,
  change: PlacementChange, eventsSoFar: readonly SimEvent[]): RuleResult {
  // Placement reactions stay room-only (WORK-034-2, tier 1): the site's resident does not walk over to a placed charm.
  if (change.space.kind !== 'room') return { state: current, events: [] };
  const roomId = change.space.roomId;
  const petId = content.rooms[roomId]?.residentPetId;
  // An outside resident is on the street, not in the room: no reaction until the presence roll brings it home.
  if (change.kind !== 'placed' || !petId || !current.pets[petId] || current.pets[petId].outside) return { state: current, events: [] };
  const fulfilled = eventsSoFar.find(event => event.type === 'want.fulfilled' && event.petId === petId);
  const slotId = fulfilled?.type === 'want.fulfilled' ? fulfilled.focusSlotId : change.slotId;
  const typeId = current.rooms[roomId].placements[slotId];
  const at: Placement = { content, petId, slotId, typeId,
    replacing: usingSlotOf(current.pets[petId].behaviour) === change.slotId };
  const reaction = fulfilled ? 'love' : ladderFor(content, content.pets[petId], typeOf(content, typeId),
    activeWant(content, current, petId)?.want ?? null);
  if (reaction === 'love' || reaction === 'like') return walkOver(at, current, reaction);
  return reaction === 'dislike' ? dislike(at, current) : noReaction(at, current);
}
