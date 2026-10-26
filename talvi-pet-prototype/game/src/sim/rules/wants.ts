import { ContentError, type Content } from '../../content/load';
import type { Condition, Pet, Want } from '../../content/schema/pet';
import type { ConditionView, RuleResult, SimEvent } from '../events';
import type { GameState, PetId, RoomId, SlotId, TagId, WantId } from '../state';
import { buildScript, enqueueScript } from './dialogue';
import { grantTypes, ownsTag } from './inventory';
import type { PlacementChange } from './slots';
import { starsOf } from './stars';

type Availability = NonNullable<ConditionView['availability']>;

function petOf(content: Content, petId: PetId): Pet {
  const pet = content.pets[petId];
  if (!pet) throw new ContentError([{ code: 'custom', file: `pets/${petId}.json`, path: ['id'],
    message: `Unknown pet id "${petId}"` }]);
  return pet;
}

function homeOf(content: Content, petId: PetId): RoomId {
  const room = Object.values(content.rooms).find(candidate => candidate.residentPetId === petId);
  if (!room) throw new Error(`Missing room for pet ${petId}`);
  return room.id;
}

function tagsOf(content: Content, typeId: string): readonly TagId[] {
  return content.charms.types.find(type => type.id === typeId)?.tags ?? [];
}

/** Slot ids of the room (file order) whose placement carries `tag`. */
function slotsWithTag(content: Content, state: GameState, roomId: RoomId, tag: TagId): SlotId[] {
  const placements = state.rooms[roomId].placements;
  return content.rooms[roomId].slots.map(slot => slot.id)
    .filter(slotId => placements[slotId] !== undefined && tagsOf(content, placements[slotId]).includes(tag));
}

/** MEC-009 R2: the first want not yet fulfilled, or null when exhausted. */
export function activeWant(content: Content, state: GameState, petId: PetId): { want: Want; index: number } | null {
  const fulfilled = new Set(state.pets[petId]?.fulfilledWantIds ?? []);
  const index = petOf(content, petId).wants.findIndex(want => !fulfilled.has(want.id));
  return index < 0 ? null : { want: petOf(content, petId).wants[index], index };
}

function projectsHolding(content: Content, state: GameState, tag: TagId): number[] {
  const offsets: number[] = [];
  for (const project of content.projects) {
    if (state.projects[project.id].complete) continue;
    const acknowledged = state.projects[project.id].acknowledgedPhase;
    project.phaseRewards.forEach((ids, phase) => {
      if (phase >= acknowledged && ids.some(id => tagsOf(content, id).includes(tag))) offsets.push(phase - acknowledged);
    });
  }
  return offsets;
}

function inHeartBundle(content: Content, state: GameState, tag: TagId, exceptWantId: WantId | null): boolean {
  return Object.values(content.pets).some(pet => pet.wants.some(want =>
    want.id !== exceptWantId && !state.pets[pet.id].fulfilledWantIds.includes(want.id) &&
    want.reward.kind === 'types' && want.reward.typeIds.some(id => tagsOf(content, id).includes(tag))));
}

/** MEC-009 R7, first match wins; `exceptWantId` is the want whose panel asks (internal). */
function availabilityFor(content: Content, state: GameState, tag: TagId, exceptWantId: WantId | null): Availability {
  if (ownsTag(content, state, tag)) return 'owned';
  const offsets = projectsHolding(content, state, tag);
  if (offsets.includes(0)) return 'nextPhase';
  if (offsets.length > 0) return 'laterPhase';
  return inHeartBundle(content, state, tag, exceptWantId) ? 'heart' : 'never';
}

export function tagAvailability(content: Content, state: GameState, tag: TagId): Availability {
  return availabilityFor(content, state, tag, null);
}

function adjacentMet(content: Content, state: GameState, roomId: RoomId, tagA: TagId, tagB: TagId): boolean {
  const slots = content.rooms[roomId].slots;
  const withA = new Set(slotsWithTag(content, state, roomId, tagA));
  const withB = new Set(slotsWithTag(content, state, roomId, tagB));
  return slots.some(slot => slot.adjacent.some(other => other !== slot.id &&
    ((withA.has(slot.id) && withB.has(other)) || (withB.has(slot.id) && withA.has(other)))));
}

function viewOf(content: Content, state: GameState, petId: PetId, want: Want, condition: Condition): ConditionView {
  const roomId = homeOf(content, petId);
  if (condition.kind === 'adjacent') {
    const { tagA, tagB } = condition;
    return { kind: 'adjacent', met: adjacentMet(content, state, roomId, tagA, tagB), hidden: false, tagA, tagB };
  }
  if (condition.kind === 'stars') {
    const current = starsOf(content, state, roomId).points;
    return { kind: 'stars', met: current >= condition.min, hidden: false, min: condition.min, current };
  }
  const met = slotsWithTag(content, state, roomId, condition.tag).length > 0;
  const revealed = (state.pets[petId].revealedHiddenTags[want.id] ?? []).includes(condition.tag);
  if (condition.hidden === true && !revealed) return { kind: 'tag', met, hidden: true };
  return { kind: 'tag', met, hidden: false, tag: condition.tag,
    availability: availabilityFor(content, state, condition.tag, want.id) };
}

/** MEC-009 R4 in `conditions` order; `[]` when exhausted (`select.wantConditions`). */
export function evaluate(content: Content, state: GameState, petId: PetId): ConditionView[] {
  const active = activeWant(content, state, petId);
  return active ? active.want.conditions.map(condition => viewOf(content, state, petId, active.want, condition)) : [];
}

export const wantConditions = evaluate;

/** MEC-009 R15: unmet, visible tag conditions of the active want, in condition order. */
export function missingWantTags(content: Content, state: GameState, petId: PetId): TagId[] {
  return evaluate(content, state, petId)
    .filter(view => view.kind === 'tag' && !view.hidden && !view.met).map(view => view.tag!);
}

/** The want's hidden tag condition's tag, revealed or not (mec-007 §2.5 ladder row 1). */
export function hiddenTagOf(want: Want): TagId | null {
  const condition = want.conditions.find(candidate => candidate.kind === 'tag' && candidate.hidden === true);
  return condition?.kind === 'tag' ? condition.tag : null;
}

/** Rule-module export for reactions (mec-007): the active want's hidden tag, revealed or not. */
export function hiddenTagOfActiveWant(content: Content, state: GameState, petId: PetId): TagId | null {
  const active = activeWant(content, state, petId);
  return active ? hiddenTagOf(active.want) : null;
}

/** MEC-009 R5: record the reveal and emit `want.hiddenRevealed` once per want. */
function reveal(state: GameState, petId: PetId, wantId: WantId, tag: TagId): RuleResult {
  const pet = state.pets[petId];
  const tags = pet.revealedHiddenTags[wantId] ?? [];
  if (tags.includes(tag)) return { state, events: [] };
  const revealedHiddenTags = { ...pet.revealedHiddenTags, [wantId]: [...tags, tag] };
  return { state: { ...state, pets: { ...state.pets, [petId]: { ...pet, revealedHiddenTags } } },
    events: [{ type: 'want.hiddenRevealed', petId, wantId, tag }] };
}

/** R5 (ii) under Q9(a): at activation, reveal when the home room already holds the hidden tag. */
function revealAtActivation(content: Content, state: GameState, petId: PetId, wantId: WantId): RuleResult {
  const tag = hiddenTagOfActiveWant(content, state, petId);
  if (tag === null || slotsWithTag(content, state, homeOf(content, petId), tag).length === 0) return { state, events: [] };
  return reveal(state, petId, wantId, tag);
}

function chain(result: RuleResult, next: RuleResult): RuleResult {
  return { state: next.state, events: [...result.events, ...next.events] };
}

/** R8 / R10 step 6: `want.activated`, the activation reveal, then the announce script. */
function activate(content: Content, state: GameState, petId: PetId): RuleResult {
  const active = activeWant(content, state, petId);
  if (active === null) return { state, events: [{ type: 'wants.exhausted', petId }] };
  const wantId = active.want.id;
  let result: RuleResult = { state, events: [{ type: 'want.activated', petId, wantId, index: active.index }] };
  result = chain(result, revealAtActivation(content, result.state, petId, wantId));
  return chain(result, enqueueScript(result.state, buildScript(content, 'wantAnnounce', { petId, wantId })));
}

/** R8 / core §6.4: called once by the introduction step; a pet past its first want is a no-op. */
export function activateFirstWant(content: Content, state: GameState, petId: PetId): RuleResult {
  if (activeWant(content, state, petId)?.index !== 0) return { state, events: [] };
  return activate(content, state, petId);
}

function applyReward(content: Content, state: GameState, petId: PetId, want: Want): RuleResult {
  const reward = want.reward;
  if (reward.kind === 'types') return grantTypes(content, state, reward.typeIds, 'heart');
  if (reward.kind === 'vignette') return { state, events: [] };
  const pet = state.pets[petId];
  const verbs = pet.verbs.includes(reward.verb) ? pet.verbs : [...pet.verbs, reward.verb];
  return { state: { ...state, pets: { ...state.pets, [petId]: { ...pet, verbs } } },
    events: [{ type: 'verb.unlocked', petId, verb: reward.verb }] };
}

/** MEC-009 R10 steps 1–6 under Q6(a): no step-7 cascade. */
export function fulfil(content: Content, state: GameState, petId: PetId, focusSlotId: SlotId): RuleResult {
  const active = activeWant(content, state, petId);
  if (active === null) throw new Error(`fulfil: pet ${petId} has no active want`);
  const { want } = active;
  const pet = state.pets[petId];
  const hearts = pet.hearts + 1;
  const fulfilled: GameState = { ...state, pets: { ...state.pets,
    [petId]: { ...pet, hearts, fulfilledWantIds: [...pet.fulfilledWantIds, want.id] } } };
  let result: RuleResult = { state: fulfilled,
    events: [{ type: 'want.fulfilled', petId, wantId: want.id, hearts, reward: want.reward, focusSlotId }] };
  result = chain(result, applyReward(content, result.state, petId, want));
  result = chain(result, { state: result.state, events: [{ type: 'heart.earned', petId, hearts }] });
  result = chain(result, enqueueScript(result.state, buildScript(content, 'vignette', { petId, wantId: want.id })));
  return chain(result, activate(content, result.state, petId));
}

/** R12: the placed slot when its type carries a want tag, else the first slot (room order)
 * carrying the first tag condition's tag. */
function focusSlotOf(content: Content, state: GameState, roomId: RoomId, want: Want, change: PlacementChange): SlotId {
  const tags = want.conditions.flatMap(condition => condition.kind === 'tag' ? [condition.tag] : []);
  if (change.kind === 'placed' && tagsOf(content, change.typeId).some(tag => tags.includes(tag))) return change.slotId;
  return slotsWithTag(content, state, roomId, tags[0])[0];
}

/** MEC-009 R9 (placement-chain link after stars): home-only, introduced resident with an active want. */
export function afterRoomChange(content: Content, state: GameState, roomId: RoomId, change: PlacementChange): RuleResult {
  const petId = content.rooms[roomId]?.residentPetId;
  const active = petId ? activeWant(content, state, petId) : null;
  if (!petId || !state.pets[petId].introduced || active === null) return { state, events: [] };
  const wantId = active.want.id;
  const hidden = hiddenTagOfActiveWant(content, state, petId);
  let result: RuleResult = { state, events: [] };
  if (change.kind === 'placed' && hidden !== null && tagsOf(content, change.typeId).includes(hidden))
    result = reveal(state, petId, wantId, hidden);
  const conditions = evaluate(content, result.state, petId);
  const progressed: SimEvent = { type: 'want.progressed', petId, wantId, conditions };
  result = { state: result.state, events: [...result.events, progressed] };
  if (!conditions.every(view => view.met)) return result;
  return chain(result, fulfil(content, result.state, petId,
    focusSlotOf(content, result.state, roomId, active.want, change)));
}
