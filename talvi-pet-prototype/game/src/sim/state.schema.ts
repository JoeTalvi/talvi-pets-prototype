import { z } from 'zod';
import type { Content } from '../content/types';
import { checkInvariants } from './invariants';
import type { GameState } from './state';
import { homeSpaceOf, sitesOf, spaceDef } from './space';

/** CONTRACT-STATE / CONTRACT-PERSIST v1.5 (core §1, §8). Keys follow the core §1 field order, so a parse
 * yields the canonical key order; unknown keys (e.g. an obsolete `projects[*].guess`, DEC-039) are stripped. */
const FacingSchema = z.enum(['left', 'right', 'up', 'down']);
const PhaseSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const ReactionSchema = z.enum(['love', 'like', 'dislike', 'interrupted', 'greeting', 'stripped']);

const DialogueScriptSchema = z.object({
  source: z.enum(['orientation', 'intro', 'wantAnnounce', 'vignette', 'phaseMessage', 'completionMessage', 'tutorial']),
  speaker: z.union([z.object({ petId: z.string() }), z.object({ game: z.literal(true) })]),
  lines: z.array(z.string()), index: z.number().int(),
  wantId: z.string().optional(), projectId: z.string().optional(),
});

const PetBehaviourSchema = z.object({
  phase: z.enum(['idle', 'walking', 'using', 'reacting', 'greeting', 'meeting']), // meeting: WORK-036-1 (DEC-046)
  x: z.number(), y: z.number(), facing: z.enum(['left', 'right']), timerMs: z.number(),
  target: z.union([z.object({ slotId: z.string() }), z.object({ wanderPointId: z.string() }), z.null()]),
  verb: z.string().nullable(), reaction: ReactionSchema.nullable(),
});

const PetSchema = z.object({
  hearts: z.number().int().min(0), fulfilledWantIds: z.array(z.string()),
  revealedHiddenTags: z.record(z.string(), z.array(z.string())), verbs: z.array(z.string()),
  introduced: z.boolean(), outside: z.boolean(), behaviour: PetBehaviourSchema, rngState: z.number().int(),
  recentTargets: z.array(z.string()), wantBubbleInMs: z.number(),
  heartCharms: z.array(z.string()), strippedPending: z.array(z.string()),
});

const CelebrationSchema = z.object({
  projectId: z.string(), fromPhase: z.number().int(), toPhase: z.number().int(), completes: z.boolean(),
  unlockedTypeIds: z.array(z.string()), step: z.enum(['cutscene', 'milestone', 'reveal']), skipTaken: z.boolean(),
});

export const GameStateSchema = z.object({
  schemaVersion: z.literal(2),
  session: z.object({
    seed: z.number(), eventIntervalMs: z.number().nullable(), feedPresentation: z.enum(['events', 'trickle']),
    starsVisible: z.boolean(), muted: z.boolean(), testerLabel: z.string(), orientationShown: z.boolean(),
    petsOutside: z.enum(['roll', 'all', 'none']).default('roll'), // WORK-035-1: additive, schemaVersion stays 2
  }),
  scene: z.union([z.object({ kind: z.literal('street') }), z.object({ kind: z.literal('interior'), roomId: z.string() })]),
  avatar: z.object({ x: z.number(), y: z.number(), facing: FacingSchema, immunityMs: z.number(),
    facingCandidate: z.object({ facing: FacingSchema, heldMs: z.number() }).nullable(),
    // WORK-037-2 (Q16(a)): additive with a default, so a v2 save from before outfits loads wearing "default"
    outfitId: z.string().default('default') }),
  mode: z.enum(['play', 'design']),
  dialogue: z.object({ current: DialogueScriptSchema.nullable(), queue: z.array(DialogueScriptSchema) }),
  projects: z.record(z.string(), z.object({
    currentCents: z.number().int(), acknowledgedPhase: PhaseSchema, complete: z.boolean(), arrivalDone: z.boolean(),
  })),
  feed: z.object({ rngState: z.number().int(), sinceLastEventMs: z.number(), eventCount: z.number().int() }),
  celebration: CelebrationSchema.nullable(),
  arrival: z.object({ projectId: z.string(), petId: z.string() }).nullable(),
  siteArrival: z.object({ siteId: z.string(), petId: z.string() }).nullable(),
  inventory: z.object({ counts: z.record(z.string(), z.number()) }),
  rooms: z.record(z.string(), z.object({ placements: z.record(z.string(), z.string()) })),
  spaces: z.record(z.string(), z.object({ unlocked: z.boolean(), placements: z.record(z.string(), z.string()), arrivalDone: z.boolean() })),
  pets: z.record(z.string(), PetSchema),
  streetVisits: z.number().int().min(0).default(0), // WORK-035-1: additive, schemaVersion stays 2
  greetings: z.record(z.string(), z.object({ cooldownMs: z.number().min(0) })).default({}), // WORK-036-1: additive, version 2
});

/** The save wrapper version; every other version (all tier 1 saves are 1) is discarded, no migration. */
export const SAVE_SCHEMA_VERSION = 2 as const;
export const SaveSchema = z.object({ schemaVersion: z.literal(SAVE_SCHEMA_VERSION), savedAt: z.string(), state: GameStateSchema });
export type DiscardReason = 'schemaVersion' | 'parse' | 'unknownContentId' | 'invariantViolation';

const sameKeys = (record: object, ids: string[]) =>
  Object.keys(record).length === ids.length && ids.every(id => Object.hasOwn(record, id));

/** Every content id the state names: project/room/pet keys, counted, placed, Heart and pending types, slots, wants, verbs, targets. */
function unknownContentId(content: Content, state: GameState): boolean {
  const types = new Set(content.charms.types.map(type => type.id));
  const verbs = new Set(content.verbs.map(verb => verb.id));
  if (!sameKeys(state.projects, content.projects.map(project => project.id)) || !sameKeys(state.rooms, Object.keys(content.rooms))
    || !sameKeys(state.pets, Object.keys(content.pets))) return true;
  if (state.scene.kind === 'interior' && !content.rooms[state.scene.roomId]) return true;
  if (Object.keys(state.inventory.counts).some(id => !types.has(id))) return true;
  if (state.celebration && (!state.projects[state.celebration.projectId] || state.celebration.unlockedTypeIds.some(id => !types.has(id)))) return true;
  if (state.arrival && (!state.projects[state.arrival.projectId] || !state.pets[state.arrival.petId])) return true;
  if (!sameKeys(state.spaces, sitesOf(content).map(site => site.id))) return true;
  // WORK-037-2: an outfit id no longer in content discards (a known but locked id is tolerated; only debug makes one)
  if (state.avatar.outfitId !== 'default' && !(content.outfits ?? []).some(outfit => outfit.id === state.avatar.outfitId)) return true;
  if (state.siteArrival && (!state.spaces[state.siteArrival.siteId] || !state.pets[state.siteArrival.petId])) return true;
  for (const site of sitesOf(content)) {
    const slots = new Set(site.slots.map(slot => slot.id));
    if (Object.entries(state.spaces[site.id].placements).some(([slotId, typeId]) => !slots.has(slotId) || !types.has(typeId))) return true;
  }
  for (const [roomId, room] of Object.entries(state.rooms)) {
    const slots = new Set(content.rooms[roomId].slots.map(slot => slot.id));
    if (Object.entries(room.placements).some(([slotId, typeId]) => !slots.has(slotId) || !types.has(typeId))) return true;
  }
  if (Object.keys(state.greetings).some(key => !knownPairKey(content, key))) return true;
  return Object.entries(state.pets).some(([petId, pet]) => unknownPetId(content, petId, pet, verbs, types));
}

/** WORK-036-1: a greetings key names two distinct known pets in content order. */
function knownPairKey(content: Content, key: string): boolean {
  const order = Object.keys(content.pets);
  const [a, b, ...rest] = key.split('|');
  return rest.length === 0 && b !== undefined && order.includes(a) && order.indexOf(a) < order.indexOf(b);
}

function unknownPetId(content: Content, petId: string, pet: GameState['pets'][string], verbs: Set<string>,
  types: Set<string>): boolean {
  const wants = new Set(content.pets[petId].wants.map(want => want.id));
  const slots = new Set(spaceDef(content, homeSpaceOf(content, petId)).slots.map(slot => slot.id));
  const target = pet.behaviour.target;
  return pet.fulfilledWantIds.some(id => !wants.has(id)) || Object.keys(pet.revealedHiddenTags).some(id => !wants.has(id))
    || pet.verbs.some(id => !verbs.has(id)) || [...pet.heartCharms, ...pet.strippedPending].some(id => !types.has(id)) || pet.recentTargets.some(id => !slots.has(id))
    || (target !== null && 'slotId' in target && !slots.has(target.slotId));
}

/** The pure half of CONTRACT-PERSIST `parseSave`: WORK-004 wraps it with `JSON.parse` (a throw there is `'parse'`). */
export function parseSaveValue(content: Content, value: unknown): { state: GameState } | { discarded: DiscardReason } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { discarded: 'parse' };
  if ((value as { schemaVersion?: unknown }).schemaVersion !== SAVE_SCHEMA_VERSION) return { discarded: 'schemaVersion' };
  const parsed = SaveSchema.safeParse(value);
  if (!parsed.success) return { discarded: 'parse' };
  const state = parsed.data.state as GameState;
  if (unknownContentId(content, state)) return { discarded: 'unknownContentId' };
  if (checkInvariants(content, state).length > 0) return { discarded: 'invariantViolation' };
  return { state };
}
