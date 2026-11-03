import { describe, expect, it } from 'vitest';
import { createTickSeq } from '../../src/view/celebration/tickSeq';
import type { PlayOptions, SoundId } from '../../src/app/audio';

function fakeAudio() {
  const plays: [SoundId, PlayOptions | undefined][] = [];
  return { plays, audio: { play: (sound: SoundId, opts?: PlayOptions) => { plays.push([sound, opts]); } } };
}

describe('VERIFY-WORK-038-1-08 tick arpeggio (gate Q6(a))', () => {
  it('six arrivals 50 ms apart → semitones 0, 4, 7, 12, 12, 12 on sfx tick', () => {
    const { plays, audio } = fakeAudio();
    let t = 0;
    const seq = createTickSeq(() => audio, () => t);
    for (let i = 0; i < 6; i++, t += 50) expect(seq.tick()).toBe(true);
    expect(plays).toEqual([0, 4, 7, 12, 12, 12].map(semitones => ['tick', { semitones }]));
  });

  it('two arrivals 20 ms apart → the second is dropped; the next at ≥ 45 ms plays the next step', () => {
    const { plays, audio } = fakeAudio();
    let t = 0;
    const seq = createTickSeq(() => audio, () => t);
    expect(seq.tick()).toBe(true);
    t = 20; expect(seq.tick()).toBe(false);
    t = 44; expect(seq.tick()).toBe(false);
    t = 45; expect(seq.tick()).toBe(true);
    expect(plays.map(p => p[1]?.semitones)).toEqual([0, 4]);
  });

  it('a new sequence (or reset) restarts at 0; no audio is silent', () => {
    const { plays, audio } = fakeAudio();
    let t = 0;
    const seq = createTickSeq(() => audio, () => t);
    seq.tick(); t += 50; seq.tick();
    seq.reset(); seq.tick();
    createTickSeq(() => audio, () => t).tick();
    expect(plays.map(p => p[1]?.semitones)).toEqual([0, 4, 0, 0]);
    expect(createTickSeq(() => null, () => 0).tick()).toBe(true);
  });
});
