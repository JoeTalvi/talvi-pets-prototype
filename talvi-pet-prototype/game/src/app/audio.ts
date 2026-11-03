import type { GameState, Reaction } from '@sim/state';
import type { Log } from './log';
import type { Store } from './store';

/** TECH-015 / presentation §9: the view implements `player` over `game.sound`, so this module has no Phaser import. */
export type AudioPlayer = {
  /** `detune` in cents (Phaser `SoundConfig.detune`); 0 plays the sound at its recorded pitch. */
  play(id: string, opts: { volume: number; detune: number }): void;
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
  tick: { id: 'sfx/tick', volume: 0.5 },          // DEC-049 §C "SFX volumes (new)"
  riser: { id: 'sfx/riser', volume: 0.6 },
  reveal: { id: 'sfx/reveal', volume: 0.7 },
} as const;
export type SoundId = keyof typeof SOUNDS;

/** `semitones` pitch-steps a one-shot (detune = 100 × semitones); `volume` overrides the SOUNDS volume. */
export type PlayOptions = { semitones?: number; volume?: number };

/** DEC-049 spec §9 sound column: love +3 st, like 0, dislike −4 st at 0.35; other reactions keep the plain one-shot. */
export const REACTION_PITCH: Partial<Record<Reaction, PlayOptions>> = {
  love: { semitones: 3 },
  like: { semitones: 0 },
  dislike: { semitones: -4, volume: 0.35 },
};

export type Audio = {
  play(sound: SoundId, opts?: PlayOptions): void;
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

  const play = (sound: SoundId, opts: PlayOptions = {}) => {
    const { id } = SOUNDS[sound];
    const volume = opts.volume ?? SOUNDS[sound].volume;
    const detune = 100 * (opts.semitones ?? 0);
    if (!options.available.has(id)) return;   // user-managed sound not yet in the manifest: silent, no record
    if (player.locked()) {
      if (!lockedRecorded) { lockedRecorded = true; options.record('audio.locked', {}); }
      return;
    }
    guarded(() => player.play(id, { volume, detune }));
  };

  return {
    play,
    attach(store) {
      unsubscribes.push(
        store.subscribe('charm.placed', () => play('place')),
        // `heart` and `complete` are view-timed (DEC-049): the Heart moment and the completion beat call play().
        store.subscribe('pet.reacted', event => play('reaction', REACTION_PITCH[event.reaction])),
        store.subscribe('audio.muteChanged', event => guarded(() => player.setMute(event.muted))),
      );
    },
    start(state) { guarded(() => player.setMute(state.session.muted)); },
    detach() { for (const off of unsubscribes) off(); unsubscribes = []; },
  };
}
