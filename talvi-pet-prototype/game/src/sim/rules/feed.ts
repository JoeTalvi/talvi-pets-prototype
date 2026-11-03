import type { Content } from '../../content/types';
import type { TickAction } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { mulberry32 } from '../rng';
import type { GameState } from '../state';
import { activeProjectId, creditProject } from './projects';

/** MEC-002 §2.2: one round-up. Draw order r1 merchant, r2 amount, re-roll r2 on a whole dollar.
 * Exported for `debugSimulatePurchase` (WORK-003-4) and TOOL-004 (WORK-003-6). */
export function generateRoundup(content: Content, state: GameState): RuleResult {
  const projectId = activeProjectId(content, state);
  if (projectId === null) throw new Error('generateRoundup requires an active project');
  const pick = mulberry32(state.feed.rngState);
  const merchant = content.merchants[Math.floor(pick.value * content.merchants.length)];
  let cursor = pick.seed, amountCents: number;
  do {
    const draw = mulberry32(cursor); cursor = draw.seed;
    amountCents = merchant.minCents + Math.floor(draw.value * (merchant.maxCents - merchant.minCents + 1));
  } while (amountCents % 100 === 0);
  const changeCents = 100 - amountCents % 100;
  const drawn: GameState = { ...state,
    feed: { ...state.feed, rngState: cursor, eventCount: state.feed.eventCount + 1 } };
  const credit = creditProject(content, drawn, projectId,
    drawn.projects[projectId].currentCents + changeCents);
  const fired: SimEvent = { type: 'roundup.fired', projectId, merchantId: merchant.id,
    merchantName: merchant.name, amountCents, changeCents,
    currentCents: credit.state.projects[projectId].currentCents };
  return { state: credit.state, events: [fired, ...credit.events] };
}

/** WORK-032-1 fix 1: a dialogue is open, or the orientation is still owed (step 5 enqueues it after this step
 * on a fresh save's first tick). Deliberately not `inputFrozen`: design mode, celebrations and the arrival accrue. */
function feedPaused(state: GameState): boolean {
  return state.dialogue.current !== null || !state.session.orientationShown;
}

/** Tick step 3 (core §4): runs in every scene and mode; a frozen or finished feed, an open dialogue or an owed
 * orientation banks no time. */
export function stepFeed(content: Content, state: GameState, action: TickAction): RuleResult {
  const interval = state.session.eventIntervalMs;
  if (interval === null || feedPaused(state) || activeProjectId(content, state) === null) return { state, events: [] };
  const since = state.feed.sinceLastEventMs + action.dtMs;
  if (since < interval) return { state: { ...state, feed: { ...state.feed, sinceLastEventMs: since } }, events: [] };
  return generateRoundup(content, { ...state, feed: { ...state.feed, sinceLastEventMs: since - interval } });
}
