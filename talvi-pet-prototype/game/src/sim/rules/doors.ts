import type { Door, Point } from '../../content/schema/common';
import type { Content } from '../../content/types';
import type { RuleResult } from '../events';
import { doorEnabled } from '../select';
import type { GameState, Scene } from '../state';

function sceneDoors(content: Content, scene: Scene): Door[] {
  return scene.kind === 'street' ? content.street.houses.map(house => house.door) : content.rooms[scene.roomId].doors;
}

function contains(point: Point, door: Door): boolean {
  const { x, y, w, h } = door.rect;
  return point.x >= x && point.x < x + w && point.y >= y && point.y < y + h;
}

/** Tick step 2 door swap only. The full reducer must follow street entry with
 * celebration.onStreetEntered, before feed/pets/scripts (core.md §4). */
export function stepDoors(content: Content, state: GameState): RuleResult {
  if (state.avatar.immunityMs !== 0) return { state, events: [] };
  const hit = sceneDoors(content, state.scene).find(door => contains(state.avatar, door));
  if (!hit || !doorEnabled(content, state, hit)) return { state, events: [] };
  const to: Scene = hit.target.scene === 'street' ? { kind: 'street' } : { kind: 'interior', roomId: hit.target.roomId };
  const targetDoor = sceneDoors(content, to).find(door => door.id === hit.target.doorId);
  if (!targetDoor) throw new Error(`Unresolved target door ${hit.target.doorId}`);
  return {
    state: { ...state, scene: to, mode: 'play', avatar: {
      ...targetDoor.spawn, immunityMs: content.tuning.arrivalImmunityMs, facingCandidate: null,
    } },
    events: [{ type: 'scene.changed', from: state.scene, to, doorId: hit.id }],
  };
}
