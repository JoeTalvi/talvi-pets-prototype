import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { initialState, type GameState } from '../state';
import { generateRoundup } from './feed';
import { grantItems, isGranted } from './inventory';
import { ackFloorCents, activeProjectId, boundaryCents, creditProject, phaseOf, projectOf } from './projects';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;
type Applied = Extract<SimEvent, { type: 'debug.applied' }>;

const reject = (state: GameState, action: Action, reason: string): RuleResult =>
  ({ state, events: [{ type: 'action.rejected', action, reason }] });

/** MEC-010 §4: every debug action's first event is `debug.applied { action }`. */
function applied(action: Action, result: RuleResult, adjusted?: Applied['adjusted']): RuleResult {
  const first: Applied = adjusted ? { type: 'debug.applied', action, adjusted } : { type: 'debug.applied', action };
  return { state: result.state, events: [first, ...result.events] };
}

const session = (state: GameState, patch: Partial<GameState['session']>): GameState =>
  ({ ...state, session: { ...state.session, ...patch } });

const knownProject = (content: Content, projectId: string) =>
  content.projects.some(project => project.id === projectId);

/** MEC-010 D5 / mec-002 §2.2: one round-up now; the feed clock is untouched. */
export function debugSimulatePurchase(content: Content, state: GameState,
  action: ActionOf<'debugSimulatePurchase'>): RuleResult {
  if (activeProjectId(content, state) === null) return reject(state, action, 'noActiveProject');
  return applied(action, generateRoundup(content, state));
}

/** MEC-010 D1: null freezes; < 250 is rejected; both accepted cases reset the clock (no burst). */
export function debugSetEventInterval(_content: Content, state: GameState,
  action: ActionOf<'debugSetEventInterval'>): RuleResult {
  if (action.ms !== null && action.ms < 250) return reject(state, action, 'invalidInterval');
  const next = session(state, { eventIntervalMs: action.ms });
  return applied(action, { state: { ...next, feed: { ...next.feed, sinceLastEventMs: 0 } }, events: [] });
}

/** MEC-010 D2: the next feed event is the first of the stream for `seed` (DEC-027). */
export function debugSetSeed(_content: Content, state: GameState, action: ActionOf<'debugSetSeed'>): RuleResult {
  const next = session(state, { seed: action.seed });
  return applied(action, { state: { ...next,
    feed: { rngState: action.seed >>> 0, sinceLastEventMs: 0, eventCount: 0 } }, events: [] });
}

/** MEC-002 §2.7: clamp to `[ackFloorCents, goalCents]`; `adjusted` reports a clamp. */
export function debugSetCurrent(content: Content, state: GameState, action: ActionOf<'debugSetCurrent'>): RuleResult {
  if (!knownProject(content, action.projectId)) return reject(state, action, 'unknownProject');
  const { goalCents } = projectOf(content, action.projectId);
  const cents = Math.min(goalCents, Math.max(ackFloorCents(content, state, action.projectId), action.cents));
  const adjusted = cents === action.cents ? undefined : { field: 'cents', requested: action.cents, applied: cents };
  return applied(action, creditProject(content, state, action.projectId, cents), adjusted);
}

/** MEC-002 §2.7 `debugJumpPhase` (next boundary) and `debugCompleteProject` (the goal). */
export function debugProgress(content: Content, state: GameState,
  action: ActionOf<'debugJumpPhase' | 'debugCompleteProject'>): RuleResult {
  if (!knownProject(content, action.projectId)) return reject(state, action, 'unknownProject');
  const { goalCents } = projectOf(content, action.projectId);
  const current = state.projects[action.projectId].currentCents;
  if (current >= goalCents) return reject(state, action, 'alreadyComplete');
  const target = action.type === 'debugCompleteProject' ? goalCents
    : boundaryCents(goalCents, phaseOf(current, goalCents) + 1);
  return applied(action, creditProject(content, state, action.projectId, target));
}

/** MEC-004 R6 'debug' (v1.5): one copy of every type with no `counts` key, in `charms.types` file order;
 * a second use grants nothing. */
export function debugUnlockAllTypes(content: Content, state: GameState,
  action: ActionOf<'debugUnlockAllTypes'>): RuleResult {
  const items = content.charms.types.filter(type => !isGranted(state, type.id)).map(type => ({ typeId: type.id, count: 1 }));
  return applied(action, grantItems(content, state, items, 'debug'));
}

/** TEST-002 arm (MEC-010, DEC-043): `count` more copies of one type; the payload range is checked by `reduce`. */
export function debugGrantCopies(content: Content, state: GameState, action: ActionOf<'debugGrantCopies'>): RuleResult {
  if (!content.charms.types.some(type => type.id === action.typeId)) return reject(state, action, 'unknownType');
  return applied(action, grantItems(content, state, [{ typeId: action.typeId, count: action.count }], 'debug'));
}

/** MEC-010 D3: write the field; idempotent. */
export function debugSetting(_content: Content, state: GameState, action: ActionOf<
  'debugSetFeedPresentation' | 'debugSetStarsVisible' | 'debugSetMuted' | 'debugSetTesterLabel'>): RuleResult {
  switch (action.type) {
    case 'debugSetFeedPresentation':
      return applied(action, { state: session(state, { feedPresentation: action.mode }), events: [] });
    case 'debugSetStarsVisible': return applied(action, { state: session(state, { starsVisible: action.on }),
      events: [{ type: 'stars.visibilityChanged', visible: action.on }] });
    case 'debugSetMuted': return applied(action, { state: session(state, { muted: action.on }),
      events: [{ type: 'audio.muteChanged', muted: action.on }] });
    case 'debugSetTesterLabel':
      return applied(action, { state: session(state, { testerLabel: action.text.trim() }), events: [] });
  }
}

/** MEC-010 D4: a fresh save for `seed ?? session.seed`, keeping only the tester label. */
export function reset(content: Content, state: GameState, action: ActionOf<'reset'>): RuleResult {
  const fresh = initialState(content, action.seed ?? state.session.seed);
  return { state: session(fresh, { testerLabel: state.session.testerLabel }), events: [{ type: 'state.reset' }] };
}
