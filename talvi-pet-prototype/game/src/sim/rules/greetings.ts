import type { Content } from '../../content/types';
import type { Action, TickAction } from '../actions';
import type { GreetEmote, RuleResult, SimEvent } from '../events';
import { inputFrozen } from '../select';
import type { GameState, PairKey, PetBehaviour, PetId } from '../state';
import { petDraw, phaseChanged, withBehaviour } from './petBehaviour';
import { streetPets } from './streetPresence';
import { fulfilByGreeting } from './wants';

/** MEC-007 pet-to-pet greeting (DEC-046, WORK-036-1): proximity on the street, the `meeting` phase, compatibility-weighted
 * paired emotes, the per-pair cooldown, `greeting.played`, and the `greeted` rule (gate Q9(a)). */
type GreetBand = Content['tuning']['greetEmoteWeights'][number];
const EMOTES: readonly GreetEmote[] = ['friendly', 'polite', 'surprised'];
type StreetPet = { petId: PetId; x: number; y: number };

export const pairKey = (a: PetId, b: PetId): PairKey => `${a}|${b}`;

/** The authored compatibility of a with b; an absent entry counts as 0 (CHK-007-15 requires every entry). */
export function compatibilityOf(content: Content, a: PetId, b: PetId): number {
  return content.pets[a]?.compatibility?.[b] ?? 0;
}

/** The first band whose `minCompatibility` ≤ c (CHK-007-17 guarantees a 0 band in shipped content). */
export function bandFor(bands: readonly GreetBand[], c: number): GreetBand {
  return bands.find(band => band.minCompatibility <= c) ?? bands[bands.length - 1];
}

/** One weighted emote from the pet's own stream (TECH-008). */
export function drawEmote(content: Content, state: GameState, petId: PetId, c: number): { emote: GreetEmote; state: GameState } {
  const { weights } = bandFor(content.tuning.greetEmoteWeights, c);
  const total = EMOTES.reduce((sum, emote) => sum + weights[emote], 0);
  const draw = petDraw(state, petId);
  let left = draw.value * total;
  const emote = EMOTES.find(candidate => (left -= weights[candidate]) < 0) ?? EMOTES[EMOTES.length - 1];
  return { emote, state: draw.state };
}

function faceToward(self: PetBehaviour, other: PetBehaviour): PetBehaviour['facing'] {
  if (self.x === other.x) return self.facing;
  return self.x < other.x ? 'right' : 'left';
}

function meet(content: Content, state: GameState, petId: PetId, otherId: PetId): RuleResult {
  const behaviour = state.pets[petId].behaviour;
  const next: PetBehaviour = { ...behaviour, phase: 'meeting', facing: faceToward(behaviour, state.pets[otherId].behaviour),
    // WORK-036-1 A2: the interrupted walk's target is kept so the next wander pick treats it as the previous one.
    timerMs: content.tuning.greetMeetingMs, verb: null, reaction: null };
  return { state: withBehaviour(state, petId, next), events: [phaseChanged(petId, behaviour.phase, next)] };
}

/** Start a meeting between a and b (a before b in content order), then the `greeted` rule for a then b. No `pet.reacted`
 * (order fork 3): WORK-036-2 shows the bubbles and plays the sounds view-timed. */
export function startMeeting(content: Content, state: GameState, a: PetId, b: PetId): RuleResult {
  const metA = meet(content, state, a, b);
  const metB = meet(content, metA.state, b, a);
  const c = compatibilityOf(content, a, b);
  const drawA = drawEmote(content, metB.state, a, c);
  const drawB = drawEmote(content, drawA.state, b, c);
  const cooled: GameState = { ...drawB.state,
    greetings: { ...drawB.state.greetings, [pairKey(a, b)]: { cooldownMs: content.tuning.greetCooldownMs } } };
  const played: SimEvent = { type: 'greeting.played', petA: a, petB: b, emoteA: drawA.emote, emoteB: drawB.emote };
  const greetedA = fulfilByGreeting(content, cooled, a, b);
  const greetedB = fulfilByGreeting(content, greetedA.state, b, a);
  return { state: greetedB.state,
    events: [...metA.events, ...metB.events, played, ...greetedA.events, ...greetedB.events] };
}

/** Street pets free to meet (idle or walking), content order, with their positions. */
function candidates(content: Content, state: GameState): StreetPet[] {
  return streetPets(content, state).flatMap(({ petId }) => {
    const { phase, x, y } = state.pets[petId].behaviour;
    return phase === 'idle' || phase === 'walking' ? [{ petId, x, y }] : [];
  });
}

const distance = (a: StreetPet, b: StreetPet) => Math.hypot(a.x - b.x, a.y - b.y);

function countDown(state: GameState, dtMs: number): GameState {
  const keys = Object.keys(state.greetings);
  if (keys.length === 0) return state;
  return { ...state, greetings: Object.fromEntries(keys.map(key =>
    [key, { cooldownMs: Math.max(0, state.greetings[key].cooldownMs - dtMs) }])) };
}

/** Core §4 step 4b (order fork 1, after pets, before scripts): count every cooldown down in any scene; on the street with
 * input not frozen (order fork 4), each pair within `greetRadiusRu` whose cooldown is 0 meets; one meeting per pet. */
export function stepGreetings(content: Content, state: GameState, action: TickAction): RuleResult {
  let current = countDown(state, action.dtMs);
  if (current.scene.kind !== 'street' || inputFrozen(content, current)) return { state: current, events: [] };
  const radius = content.tuning.greetRadiusRu * content.tuning.roomUnitPx;
  const pets = candidates(content, current);
  const busy = new Set<PetId>();
  const events: SimEvent[] = [];
  pets.forEach((a, i) => pets.slice(i + 1).forEach(b => {
    if (busy.has(a.petId) || busy.has(b.petId) || distance(a, b) > radius) return;
    if ((current.greetings[pairKey(a.petId, b.petId)]?.cooldownMs ?? 0) > 0) return;
    const result = startMeeting(content, current, a.petId, b.petId);
    current = result.state; events.push(...result.events);
    busy.add(a.petId); busy.add(b.petId);
  }));
  return { state: current, events };
}

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

/** MEC-010 row 24 "Greet now" (order fork 2): the closest free street pair (ties: content order) meets at once, ignoring
 * the radius, the cooldown and `inputFrozen`. */
export function debugGreetNow(content: Content, state: GameState, action: ActionOf<'debugGreetNow'>): RuleResult {
  if (state.scene.kind !== 'street') return { state, events: [{ type: 'action.rejected', action, reason: 'notOnStreet' }] };
  const pets = candidates(content, state);
  let best: [StreetPet, StreetPet] | null = null;
  pets.forEach((a, i) => pets.slice(i + 1).forEach(b => {
    if (best === null || distance(a, b) < distance(best[0], best[1])) best = [a, b];
  }));
  if (best === null) return { state, events: [{ type: 'action.rejected', action, reason: 'noPair' }] };
  const [a, b] = best as [StreetPet, StreetPet];
  const result = startMeeting(content, state, a.petId, b.petId);
  return { state: result.state, events: [{ type: 'debug.applied', action }, ...result.events] };
}
