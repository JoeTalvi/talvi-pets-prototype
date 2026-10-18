import { createPersistence, loadPosition } from './persistence';
import { log } from './log';
// Disposable integration support; replace with sim/store in WORK-003/004/014.
export const spike = { state: loadPosition(), immunityMs: 0, fading: false, persistence: createPersistence() };
export const door = { x: 635, y: 485, w: 100, h: 125 };
export function tickSpike(move: { x: number; y: number }, delta: number): boolean {
  const dt = Math.min(delta, 100);
  spike.immunityMs = Math.max(0, spike.immunityMs - dt);
  if (spike.fading) return false;
  const previous = spike.state.avatar;
  const avatar = { x: Math.max(440, Math.min(1490, previous.x + move.x * 720 * dt / 1000)), y: Math.max(470, Math.min(940, previous.y + move.y * 720 * dt / 1000)) };
  if (avatar.x !== previous.x || avatar.y !== previous.y) {
    spike.state = { ...spike.state, avatar }; spike.persistence.changed(spike.state);
  }
  return spike.immunityMs === 0 && avatar.x >= door.x && avatar.x < door.x + door.w && avatar.y >= door.y && avatar.y < door.y + door.h;
}
export function swapScene(): void {
  const from = spike.state.scene;
  spike.state = { scene: from === 'Interior' ? 'Street' : 'Interior', avatar: { x: 760, y: 650 } };
  spike.immunityMs = 500;
  spike.persistence.changed(spike.state);
  log('scene.changed', { from, to: spike.state.scene });
}
