import { z } from 'zod';
import { log } from './log';
// Spike-only state. WORK-004 replaces this with CONTRACT-PERSIST v1.4.
export const SpikeState = z.object({ scene: z.enum(['Interior', 'Street']), avatar: z.object({ x: z.number().finite().min(0).max(1920), y: z.number().finite().min(0).max(1080) }) });
export type SpikeState = z.infer<typeof SpikeState>;
const Save = z.object({ schemaVersion: z.literal(1), state: SpikeState });
export function loadPosition(): SpikeState {
  const initial: SpikeState = { scene: 'Interior', avatar: { x: 970, y: 800 } };
  try {
    const raw = localStorage.getItem('tpp.save');
    return raw ? Save.parse(JSON.parse(raw)).state : initial;
  } catch (error) { log('save.discarded', { reason: String(error) }); return initial; }
}
export function createPersistence() {
  let pending: SpikeState | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const json = JSON.stringify({ schemaVersion: 1, state: pending });
    try { localStorage.setItem('tpp.save', json); log('save.written', { bytes: new TextEncoder().encode(json).length }); }
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
