import type { Point } from '../content/schema/common';
import type { Slot } from '../content/schema/room';
import type { Site } from '../content/schema/street';
import type { Content } from '../content/types';
import type { CharmTypeId, GameState, PetId, RoomId, SiteId, SlotId } from './state';

/** WORK-034-2: a decoratable space — an interior room or an outdoor street site (DEC-044). */
export type SpaceRef = { kind: 'room'; roomId: RoomId } | { kind: 'site'; siteId: SiteId };
export type SpaceDef = {
  slots: Slot[]; wanderPoints: (Point & { id: string })[]; walkArea: Point[];
  petSpawn: Point & { facing: 'left' | 'right' }; residentPetId: PetId;
};

/** The street's sites; content built without the zod default (tests) has none. */
export const sitesOf = (content: Content): Site[] => content.street.sites ?? [];

export const roomRef = (roomId: RoomId): SpaceRef => ({ kind: 'room', roomId });
export const siteRef = (siteId: SiteId): SpaceRef => ({ kind: 'site', siteId });

export function siteOf(content: Content, siteId: SiteId): Site {
  const site = sitesOf(content).find(candidate => candidate.id === siteId);
  if (!site) throw new Error(`Unknown site id "${siteId}"`);
  return site;
}

/** The content a space reads: a room as authored; a site with the street's walk area. */
export function spaceDef(content: Content, ref: SpaceRef): SpaceDef {
  if (ref.kind === 'room') {
    const room = content.rooms[ref.roomId];
    if (!room) throw new Error(`Unknown room id "${ref.roomId}"`);
    return room;
  }
  return { ...siteOf(content, ref.siteId), walkArea: content.street.walkArea };
}

/** A pet's home: content `home`, else the room whose `residentPetId` is the pet. */
export function homeSpaceOf(content: Content, petId: PetId): SpaceRef {
  const home = content.pets[petId]?.home;
  if (home?.kind === 'space') return siteRef(home.siteId);
  if (home?.kind === 'room') return roomRef(home.roomId);
  const room = Object.values(content.rooms).find(candidate => candidate.residentPetId === petId);
  if (!room) throw new Error(`Missing home for pet ${petId}`);
  return roomRef(room.id);
}

export function placementsOf(state: GameState, ref: SpaceRef): Record<SlotId, CharmTypeId> {
  return ref.kind === 'room' ? state.rooms[ref.roomId].placements : state.spaces[ref.siteId].placements;
}

export function withSpacePlacements(state: GameState, ref: SpaceRef, placements: Record<SlotId, CharmTypeId>): GameState {
  if (ref.kind === 'room')
    return { ...state, rooms: { ...state.rooms, [ref.roomId]: { ...state.rooms[ref.roomId], placements } } };
  return { ...state, spaces: { ...state.spaces, [ref.siteId]: { ...state.spaces[ref.siteId], placements } } };
}

/** The space whose slots the player decorates: the interior's room, or on the street the unlocked site holding `slotId`
 * (or the first unlocked site when no slot is named). */
export function playerSpace(content: Content, state: GameState, slotId?: SlotId): SpaceRef | null {
  if (state.scene.kind === 'interior') return roomRef(state.scene.roomId);
  const site = sitesOf(content).find(candidate => state.spaces[candidate.id]?.unlocked &&
    (slotId === undefined || candidate.slots.some(slot => slot.id === slotId)));
  return site ? siteRef(site.id) : null;
}

/** The pet the player shares a scene with: the interior's resident, or on the street the resident of an arrived site. */
export function scenePet(content: Content, state: GameState): { petId: PetId; ref: SpaceRef } | null {
  if (state.scene.kind === 'interior') {
    const petId = content.rooms[state.scene.roomId]?.residentPetId;
    return petId ? { petId, ref: roomRef(state.scene.roomId) } : null;
  }
  const site = sitesOf(content).find(candidate => state.spaces[candidate.id]?.arrivalDone);
  return site ? { petId: site.residentPetId, ref: siteRef(site.id) } : null;
}

export const sameSpace = (a: SpaceRef, b: SpaceRef) =>
  a.kind === 'room' ? b.kind === 'room' && a.roomId === b.roomId : b.kind === 'site' && a.siteId === b.siteId;

/** `{ roomId }` or `{ siteId }` for an event naming exactly one of them. */
export const spaceKey = (ref: SpaceRef): { roomId: RoomId } | { siteId: SiteId } =>
  ref.kind === 'room' ? { roomId: ref.roomId } : { siteId: ref.siteId };
