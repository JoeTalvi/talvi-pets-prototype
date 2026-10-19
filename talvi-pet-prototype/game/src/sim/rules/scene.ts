import type { Content } from '../../content/types';
import type { SceneAction, TickAction } from '../actions';
import type { RuleResult } from '../events';
import type { GameState } from '../state';
import { stepAvatar } from './avatar';
import { stepDoors } from './doors';
import { setDesignMode } from './mode';

function validTick(action: TickAction): boolean {
  return Number.isFinite(action.dtMs) && action.dtMs >= 0 && action.dtMs <= 100 &&
    action.move !== null && typeof action.move === 'object' &&
    typeof action.move.x === 'number' && typeof action.move.y === 'number';
}

/** Bounded WORK-003A entry point, NOT the full game reducer.
 * Executes avatar + door steps, or setDesignMode. No feed, celebration hook,
 * pet simulation, orientation/intro scripts or other action handlers exist here.
 * WORK-003 integration composes the rules in core.md §4 and replaces this harness.
 */
export function applySceneRules(content: Content, state: GameState, action: SceneAction): RuleResult {
  if (action.type === 'setDesignMode') return setDesignMode(content, state, action);
  if (action.type !== 'tick') throw new Error('applySceneRules only supports tick and setDesignMode');
  if (!validTick(action))
    return { state, events: [{ type: 'action.rejected', action, reason: 'invalidPayload' }] };
  return stepDoors(content, stepAvatar(content, state, action));
}
