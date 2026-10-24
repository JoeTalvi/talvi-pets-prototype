import type { GameState } from '@sim/state';
import type { Log } from './log';
import type { Store } from './store';

/** TECH-015 / presentation §9: the view implements `player` over `game.sound`, so this module has no Phaser import. */
export type AudioPlayer = {
  play(id: string, opts: { volume: number }): void;
  setMute(muted: boolean): void;
  locked(): boolean;
};

export type AudioOptions = {
  available: ReadonlySet<string>;   // manifest ids of `type: 'audio'` entries
  record: Log['record'];
};

/** Assets §1.2 ASSET-018 short ids → manifest ids, with the assets §2 per-sound volumes. */
export const SOUNDS = {
  place: { id: 'sfx/place', volume: 0.6 },
  heart: { id: 'sfx/heart', volume: 0.8 },
  complete: { id: 'sfx/complete', volume: 0.9 },
  reaction: { id: 'sfx/reaction', volume: 0.5 },
  phasePop: { id: 'sfx/phase-pop', volume: 0.7 },
} as const;
export type SoundId = keyof typeof SOUNDS;

export type Audio = {
  play(sound: SoundId): void;
  attach(store: Pick<Store, 'subscribe'>): void;
  start(state: GameState): void;
  detach(): void;
};

const errorPayload = (error: unknown) => ({
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack ?? '' : '',
});

export function createAudio(player: AudioPlayer, options: AudioOptions): Audio {
  let lockedRecorded = false;
  let failed = false;
  let unsubscribes: (() => void)[] = [];

  /** Playback never blocks gameplay: the first failure is recorded once and audio stays silent after. */
  const guarded = (fn: () => void) => {
    if (failed) return;
    try { fn(); } catch (error) { failed = true; options.record('app.error', errorPayload(error)); }
  };

  const play = (sound: SoundId) => {
    const { id, volume } = SOUNDS[sound];
    if (!options.available.has(id)) return;   // user-managed sound not yet in the manifest: silent, no record
    if (player.locked()) {
      if (!lockedRecorded) { lockedRecorded = true; options.record('audio.locked', {}); }
      return;
    }
    guarded(() => player.play(id, { volume }));
  };

  return {
    play,
    attach(store) {
      unsubscribes.push(
        store.subscribe('charm.placed', () => play('place')),
        store.subscribe('heart.earned', () => play('heart')),
        store.subscribe('project.completed', () => play('complete')),
        store.subscribe('pet.reacted', () => play('reaction')),
        store.subscribe('audio.muteChanged', event => guarded(() => player.setMute(event.muted))),
      );
    },
    start(state) { guarded(() => player.setMute(state.session.muted)); },
    detach() { for (const off of unsubscribes) off(); unsubscribes = []; },
  };
}
