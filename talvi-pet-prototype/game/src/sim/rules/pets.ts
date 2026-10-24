import type { Content } from '../../content/types';
import type { TickAction } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { pointInPolygon } from '../geometry';
import type { GameState, PetBehaviour, PetId, RoomId, SlotId } from '../state';
import { petDraw, petPick, petRoll, phaseChanged, toIdle, withBehaviour } from './petBehaviour';
import { ladderFor, typeOf, usingSlotOf, verbEndedOf, verbFor, verbOfTag } from './reactions';
import type { PlacementChange } from './slots';
import { activeWant } from './wants';

/** MEC-007 §3 selectors. */
export function residentPet(content: Content, state: GameState): PetId | null {
  return state.scene.kind === 'interior' ? content.rooms[state.scene.roomId]?.residentPetId ?? null : null;
}

export function petUsingSlot(content: Content, state: GameState, roomId: RoomId, slotId: SlotId): PetId | null {
  const petId = content.rooms[roomId]?.residentPetId;
  const behaviour = petId ? state.pets[petId]?.behaviour : undefined;
  return petId && behaviour && usingSlotOf(behaviour) === slotId ? petId : null;
}

type Step = { content: Content; state: GameState; petId: PetId; roomId: RoomId; dtMs: number };
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
  return step.state.rooms[step.roomId].placements[slotId] !== undefined;
}

/** §2.4 step 1–2: slots holding a liked tag whose verb the pet has, weighted (recent × penalty). */
function candidates(step: Step): { slotId: SlotId; weight: number }[] {
  const { content, state, petId, roomId } = step;
  const pet = content.pets[petId];
  const { verbs, recentTargets } = state.pets[petId];
  return content.rooms[roomId].slots.flatMap(slot => {
    const typeId = state.rooms[roomId].placements[slot.id];
    if (typeId === undefined) return [];
    const liked = pet.likes.filter(like => typeOf(content, typeId).tags.includes(like.tag));
    if (!liked.some(like => verbs.includes(verbOfTag(content, like.tag) ?? ''))) return [];
    const weight = liked.reduce((sum, like) => sum + like.weight, 0) *
      (recentTargets.includes(slot.id) ? content.tuning.recentTargetPenalty : 1);
    return [{ slotId: slot.id, weight }];
  });
}

/** §2.4 step 4: one draw, re-drawn once when it equals the wander point the pet stands on. */
function wanderTarget(step: Step): { target: PetBehaviour['target']; state: GameState } {
  const points = step.content.rooms[step.roomId].wanderPoints;
  const { x, y } = step.state.pets[step.petId].behaviour;
  const current = points.find(point => point.x === x && point.y === y)?.id;
  let pick = petPick(step.state, step.petId, points);
  if (pick.item.id === current && points.length >= 2) pick = petPick(pick.state, step.petId, points);
  return { target: { wanderPointId: pick.item.id }, state: pick.state };
}

/** §2.2 idle timeout → walking toward the §2.4 target. */
function decide(step: Step): RuleResult {
  const { content, petId, roomId } = step;
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
  const typeId = step.state.rooms[roomId].placements[chosen.slotId];
  const verb = verbFor(content, typeOf(content, typeId), content.pets[petId], step.state.pets[petId].verbs);
  return transition(step, draw.state, { ...behaviour, phase: 'walking', timerMs: 0,
    target: { slotId: chosen.slotId }, verb, reaction: null });
}

function targetPoint(step: Step, target: PetBehaviour['target']): Point | null {
  const room = step.content.rooms[step.roomId];
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
  const inside = pointInPolygon(next, step.content.rooms[step.roomId].walkArea);
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
  const typeId = step.state.rooms[step.roomId].placements[slotId];
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
  const { content, state, petId, roomId } = step;
  const behaviour = state.pets[petId].behaviour;
  const distance = (point: { x: number; y: number }) => Math.hypot(point.x - state.avatar.x, point.y - state.avatar.y);
  const nearest = content.rooms[roomId].wanderPoints
    .reduce((best, point) => (distance(point) < distance(best) ? point : best));
  const pick = petPick(state, petId, content.pets[petId].lines.greeting);
  return transition(step, pick.state, { ...behaviour, phase: 'walking', timerMs: 0,
    target: { wanderPointId: nearest.id }, verb: null, reaction: 'greeting' }, [...verbEndedOf(petId, behaviour),
    { type: 'pet.reacted', petId, reaction: 'greeting', slotId: null, typeId: null, line: pick.item, walkOver: true }]);
}

/** MEC-007 §2.2 `stepPet`: at most one transition per tick; the timer overshoot is not carried. */
export function stepPet(content: Content, state: GameState, petId: PetId, dtMs: number,
  eventsSoFar: readonly SimEvent[]): RuleResult {
  const roomId = (state.scene as { roomId: RoomId }).roomId;
  const step: Step = { content, state, petId, roomId, dtMs };
  if (eventsSoFar.some(event => event.type === 'scene.changed' && event.to.kind === 'interior' && event.to.roomId === roomId))
    return greet(step);
  const behaviour = state.pets[petId].behaviour;
  const expired = behaviour.timerMs - dtMs <= 0;
  if (behaviour.phase === 'walking') return walk(step);
  if (!expired) return countdown(step);
  if (behaviour.phase === 'idle') return decide(step);
  return behaviour.phase === 'using' ? endVerb(step) : afterBubble(step);
}

/** Core §4 step 4: only the resident pet of the current interior is stepped. */
export function stepResidentPet(content: Content, state: GameState, action: TickAction,
  eventsSoFar: readonly SimEvent[]): RuleResult {
  const petId = residentPet(content, state);
  return petId === null ? { state, events: [] } : stepPet(content, state, petId, action.dtMs, eventsSoFar);
}

/** MEC-007 §2.3 removal rows (placement-chain link): 🤔 when the used slot is emptied; idle,
 * no bubble, when the pet was walking to or reacting at it. */
export function afterRemoval(content: Content, before: GameState, current: GameState,
  change: PlacementChange): RuleResult {
  const roomId = (before.scene as { roomId: RoomId }).roomId;
  const petId = content.rooms[roomId]?.residentPetId;
  if (change.kind !== 'removed' || !petId || !current.pets[petId]) return { state: current, events: [] };
  const step: Step = { content, state: current, petId, roomId, dtMs: 0 };
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
