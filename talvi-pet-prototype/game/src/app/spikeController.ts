import { z } from 'zod';
import { log } from './log';
// Disposable integration support; replace with sim/store in WORK-003/004/014.
// Spike-only persistence moved here verbatim from persistence.ts (WORK-004-1); not CONTRACT-PERSIST.
const SpikeState = z.object({ scene: z.enum(['Interior', 'Street']), avatar: z.object({ x: z.number().finite().min(0).max(1920), y: z.number().finite().min(0).max(1080) }) });
type SpikeState = z.infer<typeof SpikeState>;
const Save = z.object({ schemaVersion: z.literal(1), state: SpikeState });
const SPIKE_KEY = 'tpp.save';
function loadPosition(): SpikeState {
  const initial: SpikeState = { scene: 'Interior', avatar: { x: 970, y: 800 } };
  try {
    const raw = localStorage.getItem(SPIKE_KEY);
    return raw ? Save.parse(JSON.parse(raw)).state : initial;
  } catch (error) { log('save.discarded', { reason: String(error) }); return initial; }
}
function createPersistence() {
  let pending: SpikeState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const json = JSON.stringify({ schemaVersion: 1, state: pending });
    try { localStorage.setItem(SPIKE_KEY, json); log('save.written', { bytes: new TextEncoder().encode(json).length }); }
    catch (error) { log('save.failed', { reason: String(error) }); }
    pending = undefined;
  };
  const hidden = () => { if (document.hidden) flush(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', hidden);
  return {
    changed(state: SpikeState) { pending = structuredClone(state); clearTimeout(timer); timer = setTimeout(flush, 250); },
    flush,
    destroy() { flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); }
  };
}
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
