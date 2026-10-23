import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import { mulberry32 } from '../../src/sim/rng';
import { chooserTypes } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';

/** Valid placeCharm/removeCharm in the current interior: an owned type of the slot's class. */
function decorate(content: Content, state: GameState, value: number): Action {
  const roomId = (state.scene as { roomId: string }).roomId;
  const slots = content.rooms[roomId].slots;
  const slot = slots[Math.floor(value * slots.length)];
  const filled = state.rooms[roomId].placements[slot.id] !== undefined;
  const choices = chooserTypes(content, state, slot.id);
  if (filled && (value * 7) % 1 < 0.3) return { type: 'removeCharm', slotId: slot.id };
  return { type: 'placeCharm', slotId: slot.id, typeId: choices[Math.floor(((value * 13) % 1) * choices.length)].id };
}

/** Bounded FX-ARB precursor (WORK-003-1): ticks, setDesignMode and valid placeCharm/removeCharm.
 * Later lanes add their action families. Targeted motion ensures both doors and design are exercised. */
export function nextAction(content: Content, state: GameState, seed: number): {
  action: Action; seed: number;
} {
  const draw = mulberry32(seed);
  if (state.scene.kind === 'interior' && draw.value < 0.2)
    return { action: { type: 'setDesignMode', on: state.mode !== 'design' }, seed: draw.seed };
  if (state.mode === 'design')
    return draw.value < 0.75 ? { action: decorate(content, state, (draw.value - 0.2) / 0.55), seed: draw.seed }
      : { action: { type: 'tick', dtMs: 100, move: { x: 1, y: 0 } }, seed: draw.seed };
  const door = state.scene.kind === 'street'
    ? content.street.houses[0].door : content.rooms[state.scene.roomId].doors[0];
  const dx = door.rect.x + door.rect.w / 2 - state.avatar.x;
  const dy = door.rect.y + door.rect.h / 2 - state.avatar.y;
  const divisor = Math.max(Math.hypot(dx, dy), content.tuning.avatarSpeedRu * content.tuning.roomUnitPx / 10);
  const move = draw.value < 0.85 ? { x: dx / divisor, y: dy / divisor }
    : { x: Math.cos(draw.value * Math.PI * 2), y: Math.sin(draw.value * Math.PI * 2) };
  return { action: { type: 'tick', dtMs: 100, move }, seed: draw.seed };
}
