import type { Content } from '../content/types';
import type { Action, TickAction } from './actions';
import type { RuleResult, SimEvent } from './events';
import { stepAvatar } from './rules/avatar';
import { afterWantActivated, stepBubbles, tapPet } from './rules/bubbles';
import {
  acknowledgeProject, arrivalFinished, closeReveal, collectRewards, cutsceneFinished, skipWait,
} from './rules/celebration';
import {
  debugProgress, debugSetCurrent, debugSetEventInterval, debugSetSeed, debugSetting, debugSimulatePurchase,
  debugGrantCopies, debugUnlockAllTypes, reset,
} from './rules/debug';
import { advanceDialogue, stepScripts } from './rules/dialogue';
import { stepDoors } from './rules/doors';
import { stepFeed } from './rules/feed';
import { setDesignMode } from './rules/mode';
import { afterRemoval, stepResidentPet } from './rules/pets';
import { afterPlacement } from './rules/reactions';
import { applyPlace, applyRemove, type PlacementChange, type SlotsResult } from './rules/slots';
import { afterRoomChange } from './rules/stars';
import { activateFirstWant, afterRoomChange as wantsAfterRoomChange } from './rules/wants';
import type { GameState } from './state';
import { debugFillSpace, debugFulfilActiveWant, debugUnlockSpace } from './rules/debugSpace';
import { maybeStartSiteArrival } from './rules/sites';
import { afterSceneChange, debugSetPetsOutside } from './rules/streetPresence';

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
  // TEST-002 arm: count an integer 1..9 (CONTRACT-CONTENT item count range).
  debugGrantCopies: action => isString(action.typeId) && isInteger(action.count) &&
    (action.count as number) >= 1 && (action.count as number) <= 9,
  debugJumpPhase: action => isString(action.projectId),
  debugCompleteProject: action => isString(action.projectId),
  debugUnlockSpace: action => isString(action.siteId),
  debugFillSpace: action => isString(action.siteId),
  debugFulfilActiveWant: action => isString(action.petId),
  debugSetStarsVisible: action => isBoolean(action.on),
  debugSetMuted: action => isBoolean(action.on),
  debugSetTesterLabel: action => isString(action.text) && action.text.trim().length <= 40,
  reset: action => action.seed === undefined || isInteger(action.seed),
  debugSetPetsOutside: action => action.mode === 'roll' || action.mode === 'all' || action.mode === 'none',
};

/** Convention 2: core §4 tick order: avatar, doors (+ the street-arrival hook), feed, pets (4),
 * scripts then bubbles (5); never reorder. */
type TickStep = (content: Content, state: GameState, action: TickAction,
  eventsSoFar: readonly SimEvent[]) => RuleResult;
const tickSteps: TickStep[] = [
  (content, state, action) => ({ state: stepAvatar(content, state, action), events: [] }),
  (content, state) => afterSceneChange(content, enterStreet(content, stepDoors(content, state))),
  // Play-session 2026-10-26 ("Wait for tap"): stepping onto the street no longer starts an owed celebration.
  (content, state, action) => stepFeed(content, state, action),
  stepResidentPet,
  (content, state, _action, eventsSoFar) => stepScripts(content, state, eventsSoFar, activateFirstWant),
  stepBubbles,
];

/** Convention 3: core §6.1 placement chain, run after slots writes the placement:
 * stars → wants → reactions (placed) / pets (removed) → the want-bubble reset on `want.activated`. */
type PlacementLink = (content: Content, before: GameState, current: GameState,
  change: PlacementChange, eventsSoFar: readonly SimEvent[]) => RuleResult;
const placementChain: PlacementLink[] = [
  (content, before, current, change) => ({ state: current, events: afterRoomChange(content, before, current, change.space) }),
  (content, _before, current, change) => wantsAfterRoomChange(content, current, change.space, change),
  afterPlacement,
  (content, before, current, change) => afterRemoval(content, before, current, change),
  (content, before, current, _change, eventsSoFar) => afterWantActivated(content, before, current, eventsSoFar),
];

/** Fork 3 (DEC-044): entering the street with the site at `arrivalAtStars` starts the mate's arrival. */
function enterStreet(content: Content, doors: RuleResult): RuleResult {
  if (!doors.events.some(event => event.type === 'scene.changed' && event.to.kind === 'street')) return doors;
  const arrival = maybeStartSiteArrival(content, doors.state);
  return { state: arrival.state, events: [...doors.events, ...arrival.events] };
}

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

type Handlers = { [K in Action['type']]:
  (content: Content, state: GameState, action: Extract<Action, { type: K }>) => RuleResult };
const handlers: Handlers = {
  tick: runTick, setDesignMode, advanceDialogue, tapPet,
  placeCharm: (content, state, action) => runPlacement(content, state, applyPlace(content, state, action)),
  removeCharm: (content, state, action) => runPlacement(content, state, applyRemove(content, state, action)),
  acknowledgeProject, cutsceneFinished, collectRewards, skipWait, closeReveal, arrivalFinished,
  debugSimulatePurchase, debugSetEventInterval, debugSetSeed, debugSetCurrent, debugUnlockAllTypes, debugGrantCopies, reset,
  debugJumpPhase: debugProgress, debugCompleteProject: debugProgress,
  debugSetFeedPresentation: debugSetting, debugSetStarsVisible: debugSetting, debugSetMuted: debugSetting,
  debugSetTesterLabel: debugSetting,
  debugUnlockSpace, debugFulfilActiveWant,
  debugFillSpace: (content, state, action) => debugFillSpace(content, state, action, runPlacement),
  debugSetPetsOutside,
};

/** CONTRACT-ACTIONS v1.5: apply fully, or reject with `result.state === state`. Every action is handled. */
export function reduce(content: Content, state: GameState, action: Action): RuleResult {
  const validate = payloadValid[action?.type];
  if (!validate || !validate(action as unknown as Payload))
    return { state, events: [{ type: 'action.rejected', action, reason: 'invalidPayload' }] };
  const handle = handlers[action.type] as (content: Content, state: GameState, action: Action) => RuleResult;
  return handle(content, state, action);
}
