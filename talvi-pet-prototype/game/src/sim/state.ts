import type { Content } from '../content/types';
import { petSeed } from './rng';

/** CONTRACT-STATE/ACTIONS/EVENTS/SELECT v1.5 (core.md + WORK-033-1 amendment); no derived view state. */
export const CONTRACT_VERSION = '1.5' as const;
export type RoomId = string;
export type ProjectId = string;
export type CharmTypeId = string;
export type SlotId = string;
export type PetId = string;
export type WantId = string;
export type TagId = string;
export type VerbId = string;
export type DoorId = string;

export type GameState = {
  schemaVersion: 2;                // v1.5: tier 1 saves (version 1) are discarded on load, no migration (DEC-043)
  session: {                      // persisted so a tester's build sticks across reloads (MEC-010)
    seed: number;                 // feed seed shown in the debug panel (DEC-027)
    eventIntervalMs: number | null; // null = frozen (TEST-008); default tuning.eventIntervalMs = 20000; ≥ 250 otherwise
    feedPresentation: 'events' | 'trickle'; // TEST-003 arm; presentation-only (toasts, bar glide); default 'events'
    starsVisible: boolean;        // TEST-001 toggle, default true
    muted: boolean;               // DEC-034, default false
    testerLabel: string;          // free text, first log line; kept across `reset`
    orientationShown: boolean;    // the two opening lines (design §4, 0:00) shown once per save
  };
  scene: { kind: 'street' } | { kind: 'interior'; roomId: RoomId };
  avatar: { x: number; y: number; facing: Facing; immunityMs: number;
            facingCandidate: { facing: Facing; heldMs: number } | null }; // 60 ms facing debounce (mec-001 R2)
  mode: 'play' | 'design';        // design only in interiors (MEC-001)
  dialogue: { current: DialogueScript | null; queue: DialogueScript[] }; // MEC-008; open ⇒ input frozen
  projects: Record<ProjectId, {
    currentCents: number;         // 0..goalCents; written only by projects.creditProject (mec-002)
    acknowledgedPhase: 0 | 1 | 2 | 3 | 4 | 5; // what the house sprite and reward state show (DEC-028)
    complete: boolean;            // set at the completing celebration's collectRewards
    arrivalDone: boolean;         // set by arrivalFinished; the interior door is enabled only then (DEC-026)
  }>;
  feed: { rngState: number; sinceLastEventMs: number; eventCount: number }; // feed RNG stream (TECH-008)
  celebration: {                  // acknowledgeProject → closeReveal (mec-002); persisted (replay, TECH-007)
    projectId: ProjectId; fromPhase: number; toPhase: number; completes: boolean;
    unlockedTypeIds: CharmTypeId[]; step: 'cutscene' | 'milestone' | 'reveal'; skipTaken: boolean;
  } | null;
  arrival: { projectId: ProjectId; petId: PetId } | null; // completing celebration → arrivalFinished
  // DEC-043: copies in hand per type (placed copies are not counted); key order = first grant (chooser order);
  // a key is never deleted, a type at 0 keeps its place ("none left").
  inventory: { counts: Record<CharmTypeId, number> };
  rooms: Record<RoomId, { placements: Record<SlotId, CharmTypeId> }>; // absent key = empty slot
  pets: Record<PetId, {
    hearts: number;               // = fulfilledWantIds.length (DEC-023)
    fulfilledWantIds: WantId[];
    revealedHiddenTags: Record<WantId, TagId[]>; // hidden "?" slots revealed (DEC-021)
    verbs: VerbId[];              // profile `atStart` verbs + Heart unlocks
    introduced: boolean;          // intro dialogue shown on first room entry
    behaviour: PetBehaviour;      // mec-007 state machine; stepped only while the player is in the pet's room
    rngState: number;             // pet RNG stream; initial (seed ^ (0x9E3779B9 × (i + 1))) >>> 0, i = pet index in content order
    recentTargets: SlotId[];      // last tuning.recentTargetsKept slots used (mec-007)
    wantBubbleInMs: number;       // countdown to the next want bubble; initial tuning.wantBubbleEveryMs (mec-008)
    heartCharms: CharmTypeId[];   // distinct types credited at any fulfilment (tag-matching home placements), first-credit order
    strippedPending: CharmTypeId[]; // Heart charms removed from the home room whose reaction has not played; FIFO, distinct
  }>;
};
export type Facing = 'left' | 'right' | 'up' | 'down';
export type DialogueScript = { source: 'orientation' | 'intro' | 'wantAnnounce' | 'vignette' | 'phaseMessage' | 'completionMessage' | 'tutorial';
                        speaker: { petId: PetId } | { game: true }; lines: string[]; index: number;
                        wantId?: WantId; projectId?: ProjectId };   // lines are copied in at enqueue (mec-008)
export type PetBehaviour = { phase: 'idle' | 'walking' | 'using' | 'reacting' | 'greeting';
                      x: number; y: number; facing: 'left' | 'right'; timerMs: number;
                      target: { slotId: SlotId } | { wanderPointId: string } | null;
                      verb: VerbId | null; reaction: Reaction | null };
export type Reaction = 'love' | 'like' | 'dislike' | 'interrupted' | 'greeting';

export type Scene = GameState['scene'];

function initialPets(content: Content, seed: number): GameState['pets'] {
  return Object.fromEntries(Object.values(content.pets).map((pet, index) => {
    const room = Object.values(content.rooms).find(room => room.residentPetId === pet.id);
    if (!room) throw new Error(`Missing room for pet ${pet.id}`);
    return [pet.id, {
      hearts: 0, fulfilledWantIds: [], revealedHiddenTags: {},
      verbs: pet.verbs.filter(entry => entry.atStart).map(entry => entry.verb),
      introduced: false,
      behaviour: { phase: 'idle', ...room.petSpawn, timerMs: content.tuning.idleMs.min,
        target: null, verb: null, reaction: null },
      rngState: petSeed(seed, index), recentTargets: [],
      wantBubbleInMs: content.tuning.wantBubbleEveryMs, heartCharms: [], strippedPending: [],
    }];
  }));
}

/** The starter set in file order with its counts (a repeated type adds up). */
function starterCounts(content: Content): Record<CharmTypeId, number> {
  const counts: Record<CharmTypeId, number> = {};
  for (const { typeId, count } of content.charms.starterSet) counts[typeId] = (counts[typeId] ?? 0) + count;
  return counts;
}

/** Validated content enters here; orientation is enqueued by a later tick module. */
export function initialState(content: Content, seed: number): GameState {
  if (!Number.isFinite(seed)) throw new RangeError('Initial seed must be finite');
  return {
    schemaVersion: 2,
    session: { seed, eventIntervalMs: content.tuning.eventIntervalMs,
      feedPresentation: 'events', starsVisible: true, muted: false,
      testerLabel: '', orientationShown: false },
    scene: { kind: 'street' },
    avatar: { ...content.street.playerSpawn, immunityMs: 0, facingCandidate: null },
    mode: 'play', dialogue: { current: null, queue: [] },
    projects: Object.fromEntries(content.projects.map(project => [project.id, {
      currentCents: project.completeAtStart ? project.goalCents : 0,
      acknowledgedPhase: project.completeAtStart ? 5 : 0,
      complete: project.completeAtStart, arrivalDone: project.completeAtStart,
    }])),
    feed: { rngState: seed >>> 0, sinceLastEventMs: 0, eventCount: 0 },
    celebration: null, arrival: null,
    inventory: { counts: starterCounts(content) },
    rooms: Object.fromEntries(Object.keys(content.rooms).map(id => [id, { placements: {} }])),
    pets: initialPets(content, seed),
  };
}
