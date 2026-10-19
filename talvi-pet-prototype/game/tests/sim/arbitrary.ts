import type { Content } from '../../src/content/types';
import type { SceneAction } from '../../src/sim/actions';
import { mulberry32 } from '../../src/sim/rng';
import type { GameState } from '../../src/sim/state';

/** Bounded FX-ARB precursor: valid MEC-001 actions only. Full action mix waits for
 * the full reducer. Targeted motion ensures both doors and design are exercised. */
export function nextSceneAction(content: Content, state: GameState, seed: number): {
  action: SceneAction; seed: number;
} {
  const draw = mulberry32(seed);
  if (state.scene.kind === 'interior' && draw.value < 0.2)
    return { action: { type: 'setDesignMode', on: state.mode !== 'design' }, seed: draw.seed };
  if (state.mode === 'design')
    return { action: { type: 'tick', dtMs: 100, move: { x: 1, y: 0 } }, seed: draw.seed };
  const door = state.scene.kind === 'street'
    ? content.street.houses[0].door : content.rooms[state.scene.roomId].doors[0];
  const dx = door.rect.x + door.rect.w / 2 - state.avatar.x;
  const dy = door.rect.y + door.rect.h / 2 - state.avatar.y;
  const divisor = Math.max(Math.hypot(dx, dy), content.tuning.avatarSpeedRu * content.tuning.roomUnitPx / 10);
  const move = draw.value < 0.85 ? { x: dx / divisor, y: dy / divisor }
    : { x: Math.cos(draw.value * Math.PI * 2), y: Math.sin(draw.value * Math.PI * 2) };
  return { action: { type: 'tick', dtMs: 100, move }, seed: draw.seed };
}
