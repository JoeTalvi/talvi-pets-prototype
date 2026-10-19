import type { Point } from '../../content/schema/common';
import type { Content } from '../../content/types';
import type { TickAction } from '../actions';
import { pointInPolygon } from '../geometry';
import { inputFrozen } from '../select';
import type { Facing, GameState } from '../state';

function effectiveMove(move: Point): Point {
  if (!Number.isFinite(move.x) || !Number.isFinite(move.y)) return { x: 0, y: 0 };
  const largest = Math.max(Math.abs(move.x), Math.abs(move.y));
  // Rescale first so even finite components near MAX_VALUE cannot overflow hypot.
  const scaled = largest > 1 ? { x: move.x / largest, y: move.y / largest } : move;
  const length = Math.hypot(scaled.x, scaled.y);
  return largest > 1 || length > 1 ? { x: scaled.x / length, y: scaled.y / length } : scaled;
}

function facingOf(move: Point): Facing {
  return Math.abs(move.x) >= Math.abs(move.y)
    ? (move.x < 0 ? 'left' : 'right') : (move.y < 0 ? 'up' : 'down');
}

function stepFacing(avatar: GameState['avatar'], move: Point, dtMs: number, debounceMs: number) {
  if (move.x === 0 && move.y === 0) return { facing: avatar.facing, facingCandidate: null };
  const next = facingOf(move), pending = avatar.facingCandidate;
  if (pending === null || next === avatar.facing)
    return { facing: next, facingCandidate: { facing: next, heldMs: 0 } };
  if (next !== pending.facing)
    return { facing: avatar.facing, facingCandidate: { facing: next, heldMs: 0 } };
  const heldMs = pending.heldMs + dtMs;
  return { facing: heldMs >= debounceMs ? next : avatar.facing,
    facingCandidate: { facing: next, heldMs } };
}

function slide(position: Point, delta: Point, polygon: readonly Point[]): Point {
  const both = { x: position.x + delta.x, y: position.y + delta.y };
  if (pointInPolygon(both, polygon)) return both;
  const xOnly = { x: both.x, y: position.y };
  if (pointInPolygon(xOnly, polygon)) return xOnly;
  const yOnly = { x: position.x, y: both.y };
  return pointInPolygon(yOnly, polygon) ? yOnly : position;
}

/** Tick step 1 only. Caller validates dtMs; movement follows MEC-001 R1–R3. */
export function stepAvatar(content: Content, state: GameState, action: TickAction): GameState {
  const move = inputFrozen(content, state) ? { x: 0, y: 0 } : effectiveMove(action.move);
  const polygon = state.scene.kind === 'street' ? content.street.walkArea : content.rooms[state.scene.roomId].walkArea;
  const distance = content.tuning.avatarSpeedRu * content.tuning.roomUnitPx * action.dtMs / 1000;
  const position = slide(state.avatar, { x: move.x * distance, y: move.y * distance }, polygon);
  return { ...state, avatar: {
    ...state.avatar, x: position.x, y: position.y,
    ...stepFacing(state.avatar, move, action.dtMs, content.tuning.facingDebounceMs),
    immunityMs: Math.max(0, state.avatar.immunityMs - action.dtMs),
  } };
}
