import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult } from '../events';
import type { GameState } from '../state';
import { playerSpace } from '../space';
import { maybeStartSiteArrival } from './sites';

/** MEC-001 R5: invalidPayload precedes ordered action preconditions. */
export function setDesignMode(content: Content, state: GameState,
  action: Extract<Action, { type: 'setDesignMode' }>): RuleResult {
  const reason = typeof action.on !== 'boolean' ? 'invalidPayload'
    : action.on === (state.mode === 'design') ? 'noChange'
    // WORK-034-2 (MEC-001): the street allows design mode once a site is unlocked.
    : action.on && state.scene.kind !== 'interior' && playerSpace(content, state) === null ? 'siteLocked'
    // Play-session Q17: leaving Decorate stays allowed while a dialogue is pending (the want story waits for the nap).
    : action.on && state.dialogue.current !== null ? 'dialogueOpen'
    : action.on && state.celebration !== null ? 'celebrationActive'
    : action.on && (state.arrival !== null || state.siteArrival !== null) ? 'arrivalActive' : null;
  if (reason) return { state, events: [{ type: 'action.rejected', action, reason }] };
  const mode = action.on ? 'design' : 'play';
  const changed: RuleResult = { state: { ...state, mode }, events: [{ type: 'mode.changed', mode }] };
  if (action.on) return changed;
  // Fork 3 (DEC-044): leaving design mode on the street with the site at arrivalAtStars starts the mate's arrival.
  const arrival = maybeStartSiteArrival(content, changed.state);
  return { state: arrival.state, events: [...changed.events, ...arrival.events] };
}
