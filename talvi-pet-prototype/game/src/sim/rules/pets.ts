import type { Content } from '../../content/types';
import type { TickAction } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { pointInPolygon } from '../geometry';
import type { GameState, PetBehaviour, PetId, RoomId, SlotId } from '../state';
import { petDraw, petPick, petRoll, phaseChanged, toIdle, withBehaviour } from './petBehaviour';
import { ladderFor, typeOf, usingSlotOf, verbEndedOf, verbFor, verbOfTag } from './reactions';
import type { PlacementChange } from './slots';
import { activeWant } from './wants';
import { placementsOf, roomRef, scenePet, spaceDef, type SpaceDef, type SpaceRef } from '../space';
import { streetPets } from './streetPresence';

/** MEC-007 §3 selectors. */
export function residentPet(content: Content, state: GameState): PetId | null {
  return state.scene.kind === 'interior' ? content.rooms[state.scene.roomId]?.residentPetId ?? null : null;
}

export function petUsingSlot(content: Content, state: GameState, roomId: RoomId, slotId: SlotId): PetId | null {
  const petId = content.rooms[roomId]?.residentPetId;
  const behaviour = petId ? state.pets[petId]?.behaviour : undefined;
  return petId && behaviour && usingSlotOf(behaviour) === slotId ? petId : null;
}

type Step = { content: Content; state: GameState; petId: PetId; ref: SpaceRef; def: SpaceDef; dtMs: number };
const placed = (step: Step) => placementsOf(step.state, step.ref);
type Point = { x: number; y: number; facing?: 'left' | 'right' };

function transition(step: Step, state: GameState, next: PetBehaviour, events: SimEvent[] = []): RuleResult {
  const from = step.state.pets[step.petId].behaviour.phase;
  return { state: withBehaviour(state, step.petId, next), events: [...events, phaseChanged(step.petId, from, next)] };
}

function countdown(step: Step): RuleResult {
  const behaviour = step.state.pets[step.petId].behaviour;
  return { state: withBehaviour(step.state, step.petId, { ...behaviour, timerMs: behaviour.timerMs - step.dtMs }), events: [] };
}

function slotHolds(step: Step, slotId: SlotId): boolean {
  return placed(step)[slotId] !== undefined;
}

/** §2.4 step 1–2: slots holding a liked tag whose verb the pet has, weighted (recent × penalty). */
function candidates(step: Step): { slotId: SlotId; weight: number }[] {
  const { content, state, petId } = step;
  // No slot use on the street (WORK-034-2, tier 1): a site's resident only wanders.
  if (step.ref.kind !== 'room') return [];
  const pet = content.pets[petId];
  const { verbs, recentTargets } = state.pets[petId];
  return step.def.slots.flatMap(slot => {
    const typeId = placed(step)[slot.id];
    if (typeId === undefined) return [];
    const liked = pet.likes.filter(like => typeOf(content, typeId).tags.includes(like.tag));
    if (!liked.some(like => verbs.includes(verbOfTag(content, like.tag) ?? ''))) return [];
    const weight = liked.reduce((sum, like) => sum + like.weight, 0) *
      (recentTargets.includes(slot.id) ? content.tuning.recentTargetPenalty : 1);
    return [{ slotId: slot.id, weight }];
  });
}

/** §2.4 step 4 (fork #36 resolved 2026-10-26): one draw among the wander points other than the one the pet stands on,
 * so it never wanders to the same point twice in a row. */
function wanderTarget(step: Step): { target: PetBehaviour['target']; state: GameState } {
  const points = step.def.wanderPoints;
  const { x, y } = step.state.pets[step.petId].behaviour;
  const others = points.filter(point => point.x !== x || point.y !== y);
  const pick = petPick(step.state, step.petId, others.length > 0 ? others : points);
  return { target: { wanderPointId: pick.item.id }, state: pick.state };
}

/** DEC-043 / OQ-26: looking for a stripped Heart charm — one sad emote and one `lines.stripped` line, once per type (FIFO). */
function strippedReaction(step: Step): RuleResult {
  const { content, petId } = step;
  const pet = step.state.pets[petId];
  const [typeId, ...rest] = pet.strippedPending;
  const pick = petPick(step.state, petId, content.pets[petId].lines.stripped);
  const state = { ...pick.state, pets: { ...pick.state.pets, [petId]: { ...pick.state.pets[petId], strippedPending: rest } } };
  return transition(step, state, { ...pet.behaviour, phase: 'reacting', timerMs: content.tuning.bubbleTextMs,
    target: null, verb: null, reaction: 'stripped' },
  [{ type: 'pet.reacted', petId, reaction: 'stripped', slotId: null, typeId, line: pick.item, walkOver: false }]);
}

/** §2.2 idle timeout → walking toward the §2.4 target; a pending stripped charm is looked for first. */
function decide(step: Step): RuleResult {
  const { content, petId } = step;
  // The existing hold: no reaction bubble while a dialogue is open; it waits for a later decide.
  // WORK-035-1: a house pet in its yard does not look for a stripped charm; it waits until it is home again.
  if (step.ref.kind !== 'yard' && step.state.pets[petId].strippedPending.length > 0 && step.state.dialogue.current === null)
    return strippedReaction(step);
  const behaviour = step.state.pets[petId].behaviour;
  const list = candidates(step);
  if (list.length === 0) {
    const wander = wanderTarget(step);
    return transition(step, wander.state, { ...behaviour, phase: 'walking', timerMs: 0,
      target: wander.target, verb: null, reaction: null });
  }
  const draw = petDraw(step.state, petId);
  const total = list.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cumulative = 0;
  const chosen = list.find(candidate => (cumulative += candidate.weight) >= draw.value * total) ?? list[list.length - 1];
  const typeId = placed(step)[chosen.slotId];
  const verb = verbFor(content, typeOf(content, typeId), content.pets[petId], step.state.pets[petId].verbs);
  return transition(step, draw.state, { ...behaviour, phase: 'walking', timerMs: 0,
    target: { slotId: chosen.slotId }, verb, reaction: null });
}

function targetPoint(step: Step, target: PetBehaviour['target']): Point | null {
  const room = step.def;
  if (target === null) return null;
  if ('slotId' in target) return room.slots.find(slot => slot.id === target.slotId)?.anchor ?? null;
  return room.wanderPoints.find(point => point.id === target.wanderPointId) ?? null;
}

function startVerb(step: Step, at: PetBehaviour, slotId: SlotId, verb: string): RuleResult {
  const roll = petRoll(step.state, step.petId, step.content.tuning.verbHoldMs);
  return transition(step, roll.state, { ...at, phase: 'using', timerMs: roll.ms, reaction: null },
    [{ type: 'pet.verbStarted', petId: step.petId, verb, slotId }]);
}

function toIdleFrom(step: Step, at: PetBehaviour): RuleResult {
  const idle = toIdle(step.content, withBehaviour(step.state, step.petId, at), step.petId);
  return transition(step, idle.state, idle.behaviour);
}

/** §2.2 arrival rows (position already snapped into `at`). */
function arrive(step: Step, at: PetBehaviour): RuleResult {
  const slotId = at.target !== null && 'slotId' in at.target ? at.target.slotId : null;
  if (at.reaction !== null)
    return transition(step, step.state, { ...at, phase: at.reaction === 'greeting' ? 'greeting' : 'reacting',
      timerMs: step.content.tuning.bubbleMs });
  if (at.verb !== null && slotId !== null && slotHolds(step, slotId)) return startVerb(step, at, slotId, at.verb);
  return toIdleFrom(step, at);
}

/** §2.2 walking / §2.8: straight line at petSpeedRu × roomUnitPx; the walk polygon is a safety net. */
function walk(step: Step): RuleResult {
  const behaviour = step.state.pets[step.petId].behaviour;
  const point = targetPoint(step, behaviour.target);
  if (point === null) return arrive(step, behaviour);
  const dx = point.x - behaviour.x, dy = point.y - behaviour.y, remaining = Math.hypot(dx, dy);
  const facing = dx < 0 ? 'left' : dx > 0 ? 'right' : behaviour.facing;
  const stepPx = step.content.tuning.petSpeedRu * step.content.tuning.roomUnitPx * step.dtMs / 1000;
  if (remaining <= stepPx)
    return arrive(step, { ...behaviour, x: point.x, y: point.y, facing: point.facing ?? facing });
  const next = { x: behaviour.x + dx / remaining * stepPx, y: behaviour.y + dy / remaining * stepPx };
  const inside = pointInPolygon(next, step.def.walkArea);
  return { state: withBehaviour(step.state, step.petId, { ...behaviour, ...(inside ? next : {}), facing }), events: [] };
}

/** §2.2 reacting / greeting timeout: the pending verb if its slot still holds a charm, else idle. */
function afterBubble(step: Step): RuleResult {
  const behaviour = step.state.pets[step.petId].behaviour;
  const slotId = behaviour.target !== null && 'slotId' in behaviour.target ? behaviour.target.slotId : null;
  if (behaviour.verb !== null && slotId !== null && slotHolds(step, slotId))
    return startVerb(step, behaviour, slotId, behaviour.verb);
  return toIdleFrom(step, behaviour);
}

/** §2.2 using timeout: verbEnded, the end-of-verb ladder bubble (Q11(a)), recentTargets, idle. */
function endVerb(step: Step): RuleResult {
  const { content, petId } = step;
  const behaviour = step.state.pets[petId].behaviour;
  const slotId = usingSlotOf(behaviour)!;
  const typeId = placed(step)[slotId];
  const events = verbEndedOf(petId, behaviour);
  const reaction = typeId === undefined ? 'none' : ladderFor(content, content.pets[petId], typeOf(content, typeId),
    activeWant(content, step.state, petId)?.want ?? null);
  if (reaction !== 'none') events.push({ type: 'pet.reacted', petId, reaction, slotId, typeId, line: null, walkOver: false });
  const kept = content.tuning.recentTargetsKept;
  const recentTargets = kept === 0 ? [] : [...step.state.pets[petId].recentTargets, slotId].slice(-kept);
  const pets = { ...step.state.pets, [petId]: { ...step.state.pets[petId], recentTargets } };
  const idle = toIdle(content, { ...step.state, pets }, petId);
  return transition(step, idle.state, idle.behaviour, events);
}

/** §2.2 row 1 / §2.7: on every entry, walk to the wander point nearest the avatar's spawn. */
function greet(step: Step): RuleResult {
  const { content, state, petId } = step;
  const behaviour = state.pets[petId].behaviour;
  const distance = (point: { x: number; y: number }) => Math.hypot(point.x - state.avatar.x, point.y - state.avatar.y);
  const nearest = step.def.wanderPoints
    .reduce((best, point) => (distance(point) < distance(best) ? point : best));
  const pick = petPick(state, petId, content.pets[petId].lines.greeting);
  return transition(step, pick.state, { ...behaviour, phase: 'walking', timerMs: 0,
    target: { wanderPointId: nearest.id }, verb: null, reaction: 'greeting' }, [...verbEndedOf(petId, behaviour),
    { type: 'pet.reacted', petId, reaction: 'greeting', slotId: null, typeId: null, line: pick.item, walkOver: true }]);
}

/** Play-session Q6: on entry the pet holds still (idle, greeting pending) for `greetingDelayMs`, then greets. */
function awaitGreeting(step: Step): RuleResult {
  const behaviour = step.state.pets[step.petId].behaviour;
  return transition(step, step.state, { ...behaviour, phase: 'idle', timerMs: step.content.tuning.greetingDelayMs,
    target: null, verb: null, reaction: 'greeting' }, verbEndedOf(step.petId, behaviour));
}

/** MEC-007 §2.2 `stepPet`: at most one transition per tick; the timer overshoot is not carried. */
export function stepPet(content: Content, state: GameState, petId: PetId, dtMs: number,
  eventsSoFar: readonly SimEvent[], ref: SpaceRef = roomRef((state.scene as { roomId: RoomId }).roomId)): RuleResult {
  const step: Step = { content, state, petId, ref, def: spaceDef(content, ref), dtMs };
  // The entry greeting is an interior behaviour; a site's resident does not greet on street entry (WORK-034-2).
  if (ref.kind === 'room' && eventsSoFar.some(event => event.type === 'scene.changed' && event.to.kind === 'interior' && event.to.roomId === ref.roomId))
    return content.tuning.greetingDelayMs > 0 ? awaitGreeting(step) : greet(step);
  const behaviour = state.pets[petId].behaviour;
  const expired = behaviour.timerMs - dtMs <= 0;
  if (behaviour.phase === 'walking') return walk(step);
  if (!expired) return countdown(step);
  if (behaviour.phase === 'idle') return behaviour.reaction === 'greeting' ? greet(step) : decide(step);
  return behaviour.phase === 'using' ? endVerb(step) : afterBubble(step);
}

/** Core §4 step 4: only the pets sharing the player's scene are stepped — the current interior's resident, or on the
 * street every street pet (arrived site residents and outside house pets, content order; DEC-045, WORK-035-1). */
export function stepResidentPet(content: Content, state: GameState, action: TickAction,
  eventsSoFar: readonly SimEvent[]): RuleResult {
  if (state.scene.kind === 'street') {
    let current = state;
    const events: SimEvent[] = [];
    for (const { petId, ref } of streetPets(content, state)) {
      const result = stepPet(content, current, petId, action.dtMs, eventsSoFar, ref);
      current = result.state; events.push(...result.events);
    }
    return { state: current, events };
  }
  const here = scenePet(content, state);
  return here === null ? { state, events: [] } : stepPet(content, state, here.petId, action.dtMs, eventsSoFar, here.ref);
}

/** MEC-007 §2.3 removal rows (placement-chain link): 🤔 when the used slot is emptied; idle,
 * no bubble, when the pet was walking to or reacting at it. */
export function afterRemoval(content: Content, before: GameState, current: GameState,
  change: PlacementChange): RuleResult {
  if (change.space.kind !== 'room') return { state: current, events: [] }; // no slot use on the street (WORK-034-2)
  const roomId = change.space.roomId;
  const petId = content.rooms[roomId]?.residentPetId;
  if (change.kind !== 'removed' || !petId || !current.pets[petId]) return { state: current, events: [] };
  const step: Step = { content, state: current, petId, ref: change.space, def: spaceDef(content, change.space), dtMs: 0 };
  const behaviour = current.pets[petId].behaviour;
  const { slotId, typeId } = change;
  if (usingSlotOf(behaviour) === slotId)
    return transition(step, current, { ...behaviour, phase: 'reacting', timerMs: content.tuning.bubbleMs,
      target: { slotId }, verb: null, reaction: 'interrupted' }, [...verbEndedOf(petId, behaviour),
      { type: 'pet.reacted', petId, reaction: 'interrupted', slotId, typeId, line: null, walkOver: false }]);
  const targeted = behaviour.target !== null && 'slotId' in behaviour.target && behaviour.target.slotId === slotId;
  if (targeted && (behaviour.phase === 'walking' || behaviour.phase === 'reacting')) return toIdleFrom(step, behaviour);
  return { state: current, events: [] };
}
