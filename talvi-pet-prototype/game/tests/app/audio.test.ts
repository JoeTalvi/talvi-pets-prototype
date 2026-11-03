import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAudio, type AudioPlayer } from '../../src/app/audio';
import { createStore } from '../../src/app/store';
import type { Action } from '../../src/sim/actions';
import type { GameState } from '../../src/sim/state';
import { act, ack, dogRoomDesign, owing } from '../sim/helpers';

const ALL = new Set(['sfx/place', 'sfx/heart', 'sfx/complete', 'sfx/reaction', 'sfx/phase-pop', 'sfx/tick', 'sfx/riser', 'sfx/reveal']);
const place: Action = { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' };
const manifestAudioIds = () => new Set((JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as {
  entries: { id: string; type: string }[] }).entries.filter(a => a.type === 'audio').map(a => a.id));

type Call = { play: [string, number, number] } | { mute: boolean };
function fakePlayer(overrides: Partial<AudioPlayer> = {}) {
  const calls: Call[] = [];
  const player: AudioPlayer = {
    play: (id, opts) => { calls.push({ play: [id, opts.volume, opts.detune] }); },
    setMute: muted => { calls.push({ mute: muted }); },
    locked: () => false,
    ...overrides,
  };
  return { player, calls };
}

function wired(state: GameState, content: Parameters<typeof createStore>[0], available: ReadonlySet<string>, player: AudioPlayer) {
  const records: { type: string; payload?: Record<string, unknown> }[] = [];
  const audio = createAudio(player, { available, record: (type, payload) => records.push({ type, payload }) });
  const store = createStore(content, state);
  audio.attach(store);
  return { audio, store, records };
}

describe('presentation §9 audio subscriber', () => {
  it('VERIFY-WORK-038-1-01 audio plays place and the love reaction (+3 st) in event order; heart.earned plays nothing', () => {
    const { content, state } = dogRoomDesign();
    const { player, calls } = fakePlayer();
    const { store } = wired(state, content, ALL, player);
    store.dispatch(place);
    expect(calls).toEqual([{ play: ['sfx/place', 0.6, 0] }, { play: ['sfx/reaction', 0.5, 300] }]);
  });

  it('VERIFY-WORK-038-1-01 project.completed plays nothing (complete is view-timed); phasePop on the view-timed call', () => {
    const { content } = dogRoomDesign();
    const { player, calls } = fakePlayer();
    const { store, audio } = wired(owing(content, 4, 1500), content, ALL, player);
    for (const action of [ack, act('cutsceneFinished'), act('skipWait'), act('collectRewards')]) store.dispatch(action);
    expect(calls.filter(c => 'play' in c && (c.play[0] === 'sfx/complete' || c.play[0] === 'sfx/heart'))).toEqual([]);
    audio.play('phasePop');
    expect(calls.at(-1)).toEqual({ play: ['sfx/phase-pop', 0.7, 0] });
  });

});

describe('VERIFY-WORK-038-1-01 audio pitch and options', () => {
  it('VERIFY-WORK-038-1-01 the reaction pitch map: love +3, like 0, dislike -4 at 0.35, the others plain', () => {
    const { player, calls } = fakePlayer();
    const handlers: ((event: unknown) => void)[] = [];
    const audio = createAudio(player, { available: ALL, record: () => {} });
    audio.attach({ subscribe: ((type: string, fn: (event: unknown) => void) => {
      if (type === 'pet.reacted') handlers.push(fn);
      return () => {};
    }) as never });
    for (const reaction of ['love', 'like', 'dislike', 'greeting', 'interrupted', 'stripped']) handlers[0]({ type: 'pet.reacted', reaction });
    expect(calls).toEqual([
      { play: ['sfx/reaction', 0.5, 300] }, { play: ['sfx/reaction', 0.5, 0] }, { play: ['sfx/reaction', 0.35, -400] },
      { play: ['sfx/reaction', 0.5, 0] }, { play: ['sfx/reaction', 0.5, 0] }, { play: ['sfx/reaction', 0.5, 0] },
    ]);
  });

  it('VERIFY-WORK-038-1-01 play takes semitones and volume; the new ids carry the §C volumes', () => {
    const { player, calls } = fakePlayer();
    const audio = createAudio(player, { available: ALL, record: () => {} });
    audio.play('tick', { semitones: 7 });
    audio.play('riser');
    audio.play('reveal');
    audio.play('heart');
    audio.play('complete', { volume: 0.2 });
    expect(calls).toEqual([
      { play: ['sfx/tick', 0.5, 700] }, { play: ['sfx/riser', 0.6, 0] }, { play: ['sfx/reveal', 0.7, 0] },
      { play: ['sfx/heart', 0.8, 0] }, { play: ['sfx/complete', 0.2, 0] },
    ]);
  });

});

describe('presentation §9 audio subscriber (cont.)', () => {
  it('presentation §9 audio routes audio.muteChanged and the saved session.muted to setMute', () => {
    const { content, state } = dogRoomDesign();
    const { player, calls } = fakePlayer();
    const { store } = wired(state, content, ALL, player);
    store.dispatch({ type: 'debugSetMuted', on: true });
    expect(calls).toEqual([{ mute: true }]);
    const muted = { ...state, session: { ...state.session, muted: true } };
    const second = fakePlayer();
    createAudio(second.player, { available: ALL, record: () => {} }).start(muted);
    expect(second.calls).toEqual([{ mute: true }]);
  });

  it('presentation §9 audio detach stops every trigger', () => {
    const { content, state } = dogRoomDesign();
    const { player, calls } = fakePlayer();
    const { store, audio } = wired(state, content, ALL, player);
    audio.detach();
    store.dispatch(place);
    expect(calls).toEqual([]);
  });

});

describe('gate sound-absent, locked and failure audio', () => {
  it('gate tier2-m5 audio: all eight sfx ids are in the manifest; ids outside the available set play and record nothing', () => {
    const available = manifestAudioIds();
    expect([...available].sort()).toEqual([...ALL].sort());
    const { content, state } = dogRoomDesign();
    const { player, calls } = fakePlayer();
    const { store, records } = wired(state, content, new Set(['sfx/place']), player);
    store.dispatch(place);
    expect(calls).toEqual([{ play: ['sfx/place', 0.6, 0] }]);
    expect(records).toEqual([]);
  });

  it('presentation §9 locked audio skips play and records audio.locked once', () => {
    const { content, state } = dogRoomDesign();
    const { player, calls } = fakePlayer({ locked: () => true });
    const { store, audio, records } = wired(state, content, ALL, player);
    store.dispatch(place);
    audio.play('phasePop');
    expect(calls).toEqual([]);
    expect(records).toEqual([{ type: 'audio.locked', payload: {} }]);
  });

  it('presentation §9 failure records one app.error and keeps dispatches working', () => {
    const { content, state } = dogRoomDesign();
    const { player } = fakePlayer({ play: () => { throw new Error('decode failed'); } });
    const { store, audio, records } = wired(state, content, ALL, player);
    store.dispatch(place);
    audio.play('phasePop');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ type: 'app.error', payload: { message: 'decode failed' } });
    expect(typeof records[0].payload?.stack).toBe('string');
    store.dispatch({ type: 'removeCharm', slotId: 'large-1' });
    expect(store.getState().session).toBeDefined();
  });
});
