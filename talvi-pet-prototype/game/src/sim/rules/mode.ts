import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult } from '../events';
import type { GameState } from '../state';

/** MEC-001 R5: invalidPayload precedes ordered action preconditions. */
export function setDesignMode(_content: Content, state: GameState,
  action: Extract<Action, { type: 'setDesignMode' }>): RuleResult {
  const reason = typeof action.on !== 'boolean' ? 'invalidPayload'
    : action.on === (state.mode === 'design') ? 'noChange'
    : state.scene.kind !== 'interior' ? 'notInterior'
    : state.dialogue.current !== null ? 'dialogueOpen'
    : action.on && state.celebration !== null ? 'celebrationActive'
    : action.on && state.arrival !== null ? 'arrivalActive' : null;
  if (reason) return { state, events: [{ type: 'action.rejected', action, reason }] };
  const mode = action.on ? 'design' : 'play';
  return { state: { ...state, mode }, events: [{ type: 'mode.changed', mode }] };
}
