import type { Content } from '../../content/types';
import type { Action, TickAction } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import type { GameState, PetId, TagId } from '../state';
import { petPick } from './petBehaviour';
import { scenePet } from '../space';
import { streetPets } from './streetPresence';
import { missingWantTags, wantConditions } from './wants';

function withTimer(state: GameState, petId: PetId, wantBubbleInMs: number): GameState {
  if (state.pets[petId].wantBubbleInMs === wantBubbleInMs) return state;
  return { ...state, pets: { ...state.pets, [petId]: { ...state.pets[petId], wantBubbleInMs } } };
}

/** MEC-008 §2.2 tag choice: null when the active want has no unmet tag condition; otherwise one
 * uniform pet draw among the unmet visible tags, or `tag: null` (❓, no draw) when only hidden
 * tags are unmet (Q12(a)). */
function wantBubbleTag(content: Content, state: GameState, petId: PetId): { tag: TagId | null; state: GameState } | null {
  if (!wantConditions(content, state, petId).some(view => view.kind === 'tag' && !view.met)) return null;
  const visible = missingWantTags(content, state, petId);
  if (visible.length === 0) return { tag: null, state };
  const pick = petPick(state, petId, visible);
  return { tag: pick.item, state: pick.state };
}

/** Entering the pet's scene (its room, or the street for a site's resident) or its next want resets the countdown. */
function resetsTimer(event: SimEvent, petId: PetId, roomId: string | null): boolean {
  return (event.type === 'scene.changed' && (roomId === null ? event.to.kind === 'street'
    : event.to.kind === 'interior' && event.to.roomId === roomId)) ||
    (event.type === 'want.activated' && event.petId === petId);
}

/** Core §4 step 5, bubble half: the resident's want-bubble countdown; holds while a dialogue is open. */
export function stepBubbles(content: Content, state: GameState, action: TickAction,
  eventsSoFar: readonly SimEvent[]): RuleResult {
  const here = scenePet(content, state);
  if (here === null) return { state, events: [] };
  const petId = here.petId;
  const every = content.tuning.wantBubbleEveryMs;
  const roomId = here.ref.kind === 'room' ? here.ref.roomId : null;
  if (eventsSoFar.some(event => resetsTimer(event, petId, roomId))) return { state: withTimer(state, petId, every), events: [] };
  if (state.dialogue.current !== null) return { state, events: [] };
  const remaining = Math.max(0, state.pets[petId].wantBubbleInMs - action.dtMs);
  const choice = remaining > 0 ? null : wantBubbleTag(content, state, petId);
  if (choice === null) return { state: withTimer(state, petId, remaining), events: [] };
  return { state: withTimer(choice.state, petId, every), events: [{ type: 'pet.wantBubble', petId, tag: choice.tag }] };
}

/** Placement-chain link: a `want.activated` for the resident resets its countdown (MEC-008 §2.2). */
export function afterWantActivated(content: Content, before: GameState, current: GameState,
  eventsSoFar: readonly SimEvent[]): RuleResult {
  const petId = scenePet(content, before)?.petId ?? null;
  if (petId === null || !eventsSoFar.some(event => event.type === 'want.activated' && event.petId === petId))
    return { state: current, events: [] };
  return { state: withTimer(current, petId, content.tuning.wantBubbleEveryMs), events: [] };
}

/** MEC-008 §2.3 `tapPet`: preconditions in core §2 order; never changes `behaviour`. */
export function tapPet(content: Content, state: GameState, action: Extract<Action, { type: 'tapPet' }>): RuleResult {
  const reject = (reason: string): RuleResult => ({ state, events: [{ type: 'action.rejected', action, reason }] });
  // WORK-035-1 (fork (c)): on the street any street pet answers a tap (the want bubble countdown stays scenePet's).
  const here = state.scene.kind === 'street' ? streetPets(content, state).some(pet => pet.petId === action.petId)
    : scenePet(content, state)?.petId === action.petId;
  if (!here) return reject('petNotHere');
  if (state.dialogue.current !== null) return reject('dialogueOpen');
  if (state.celebration !== null) return reject('celebrationActive');
  const petId = action.petId;
  const want = wantBubbleTag(content, state, petId);
  if (want !== null)
    return { state: withTimer(want.state, petId, content.tuning.wantBubbleEveryMs),
      events: [{ type: 'pet.tapped', petId, bubble: { kind: 'want', tag: want.tag } }] };
  const chatter = petPick(state, petId, content.pets[petId].lines.chatter);
  return { state: chatter.state, events: [{ type: 'pet.tapped', petId, bubble: { kind: 'chatter', line: chatter.item } }] };
}
