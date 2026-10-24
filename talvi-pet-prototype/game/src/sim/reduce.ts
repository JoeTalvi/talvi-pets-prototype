import type { Content } from '../content/types';
import type { Action, TickAction } from './actions';
import type { RuleResult, SimEvent } from './events';
import { stepAvatar } from './rules/avatar';
import { advanceDialogue, stepScripts } from './rules/dialogue';
import { stepDoors } from './rules/doors';
import { stepFeed } from './rules/feed';
import { setDesignMode } from './rules/mode';
import { applyPlace, applyRemove, type PlacementChange, type SlotsResult } from './rules/slots';
import { afterRoomChange } from './rules/stars';
import { activateFirstWant, afterRoomChange as wantsAfterRoomChange } from './rules/wants';
import type { GameState, RoomId } from './state';

type Payload = Record<string, unknown>;
const isString = (value: unknown) => typeof value === 'string';
const isBoolean = (value: unknown) => typeof value === 'boolean';
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown) => isFiniteNumber(value) && Number.isInteger(value);
const none = () => true;

function validTick(action: Payload): boolean {
  const move = action.move as Payload | null;
  return isFiniteNumber(action.dtMs) && action.dtMs >= 0 && action.dtMs <= 100 &&
    move !== null && typeof move === 'object' && typeof move.x === 'number' && typeof move.y === 'number';
}

/** Convention 1(a): payload shape per action type, checked before any precondition. */
const payloadValid: Record<Action['type'], (action: Payload) => boolean> = {
  tick: validTick,
  setDesignMode: action => isBoolean(action.on),
  placeCharm: action => isString(action.slotId) && isString(action.typeId),
  removeCharm: action => isString(action.slotId),
  acknowledgeProject: action => isString(action.projectId),
  cutsceneFinished: none, collectRewards: none, skipWait: none, closeReveal: none,
  arrivalFinished: none, advanceDialogue: none, debugSimulatePurchase: none, debugUnlockAllTypes: none,
  tapPet: action => isString(action.petId),
  debugSetEventInterval: action => action.ms === null || isInteger(action.ms),
  debugSetFeedPresentation: action => action.mode === 'events' || action.mode === 'trickle',
  debugSetSeed: action => isInteger(action.seed),
  debugSetCurrent: action => isString(action.projectId) && isInteger(action.cents),
  debugJumpPhase: action => isString(action.projectId),
  debugCompleteProject: action => isString(action.projectId),
  debugSetStarsVisible: action => isBoolean(action.on),
  debugSetMuted: action => isBoolean(action.on),
  debugSetTesterLabel: action => isString(action.text),
  reset: action => action.seed === undefined || isInteger(action.seed),
};

/** Convention 2: core §4 tick order. Step 5's scripts half is the last entry; later lanes insert
 * step 4 (pets) before it, append the bubble countdown after it and the street-arrival hook after
 * doors; never reorder. */
type TickStep = (content: Content, state: GameState, action: TickAction,
  eventsSoFar: readonly SimEvent[]) => RuleResult;
const tickSteps: TickStep[] = [
  (content, state, action) => ({ state: stepAvatar(content, state, action), events: [] }),
  (content, state) => stepDoors(content, state),
  (content, state, action) => stepFeed(content, state, action),
  (content, state, _action, eventsSoFar) => stepScripts(content, state, eventsSoFar, activateFirstWant),
];

/** Convention 3: core §6.1 placement chain, run after slots writes the placement.
 * Later lanes append reactions.afterPlacement / pets.afterRemoval after the wants link. */
type PlacementLink = (content: Content, before: GameState, current: GameState,
  change: PlacementChange, eventsSoFar: readonly SimEvent[]) => RuleResult;
const placementChain: PlacementLink[] = [
  (content, before, current) => ({ state: current,
    events: afterRoomChange(content, before, current, (before.scene as { roomId: RoomId }).roomId) }),
  (content, before, current, change) =>
    wantsAfterRoomChange(content, current, (before.scene as { roomId: RoomId }).roomId, change),
];

function runTick(content: Content, state: GameState, action: TickAction): RuleResult {
  let current = state;
  const events: SimEvent[] = [];
  for (const step of tickSteps) {
    const result = step(content, current, action, events);
    current = result.state; events.push(...result.events);
  }
  return { state: current, events };
}

function runPlacement(content: Content, before: GameState, outcome: SlotsResult): RuleResult {
  if (outcome.change === null) return { state: outcome.state, events: outcome.events };
  let current = outcome.state;
  const events: SimEvent[] = [...outcome.events];
  for (const link of placementChain) {
    const result = link(content, before, current, outcome.change, events);
    current = result.state; events.push(...result.events);
  }
  return { state: current, events };
}

const laterLane: Partial<Record<Action['type'], number>> = { tapPet: 3 };

/** CONTRACT-ACTIONS v1.4: apply fully, or reject with `result.state === state`. */
export function reduce(content: Content, state: GameState, action: Action): RuleResult {
  const validate = payloadValid[action?.type];
  if (!validate || !validate(action as unknown as Payload))
    return { state, events: [{ type: 'action.rejected', action, reason: 'invalidPayload' }] };
  switch (action.type) {
    case 'tick': return runTick(content, state, action);
    case 'setDesignMode': return setDesignMode(content, state, action);
    case 'placeCharm': return runPlacement(content, state, applyPlace(content, state, action));
    case 'removeCharm': return runPlacement(content, state, applyRemove(content, state, action));
    case 'advanceDialogue': return advanceDialogue(content, state, action);
    default: throw new Error(`WORK-003-${laterLane[action.type] ?? 4} lands ${action.type}`);
  }
}
