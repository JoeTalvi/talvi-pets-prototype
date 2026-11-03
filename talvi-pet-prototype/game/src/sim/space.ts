import type { Point } from '../content/schema/common';
import type { Slot } from '../content/schema/room';
import type { House, Site } from '../content/schema/street';
import type { Content } from '../content/types';
import type { CharmTypeId, GameState, PetId, ProjectId, RoomId, SiteId, SlotId } from './state';

/** WORK-034-2: a decoratable space — an interior room or an outdoor street site (DEC-044).
 * WORK-035-1 (fork (b)): `yard` = the street in front of a house, where its room pet wanders when outside (DEC-045);
 * it has no slots and no placements, so it never reaches placement or event-key code. */
export type SpaceRef = { kind: 'room'; roomId: RoomId } | { kind: 'site'; siteId: SiteId } | { kind: 'yard'; projectId: ProjectId };
/** A space with slots (a home): never a yard. */
export type DecorRef = Extract<SpaceRef, { kind: 'room' | 'site' }>;
export type SpaceDef = {
  slots: Slot[]; wanderPoints: (Point & { id: string })[]; walkArea: Point[];
  petSpawn: Point & { facing: 'left' | 'right' }; residentPetId: PetId;
};

/** The street's sites; content built without the zod default (tests) has none. */
export const sitesOf = (content: Content): Site[] => content.street.sites ?? [];

export const roomRef = (roomId: RoomId): DecorRef => ({ kind: 'room', roomId });
export const siteRef = (siteId: SiteId): DecorRef => ({ kind: 'site', siteId });
export const yardRef = (projectId: ProjectId): SpaceRef => ({ kind: 'yard', projectId });

/** The street's shared meeting point as a wander point list (none in content without one). */
const meetingPoints = (content: Content): (Point & { id: string })[] =>
  content.street.meetingPoint ? [content.street.meetingPoint] : [];

/** The house whose door leads into `roomId`, if any. */
export function houseOfRoom(content: Content, roomId: RoomId): House | undefined {
  return content.street.houses.find(house => house.door.target.scene === 'interior' && house.door.target.roomId === roomId);
}

/** WORK-035-1: the room-homed pets that can be outside — each street house's room resident, content order. */
export function housePets(content: Content): { petId: PetId; roomId: RoomId; house: House }[] {
  return Object.values(content.pets).flatMap(pet => {
    const home = homeSpaceOf(content, pet.id);
    if (home.kind !== 'room') return [];
    const house = houseOfRoom(content, home.roomId);
    return house?.wanderPoints ? [{ petId: pet.id, roomId: home.roomId, house }] : [];
  });
}

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
  if (ref.kind === 'yard') return yardDef(content, ref.projectId);
  // WORK-035-1 (gate Q1(a)): the meeting point is a third wander target for the site's resident too.
  const site = siteOf(content, ref.siteId);
  return { ...site, wanderPoints: [...site.wanderPoints, ...meetingPoints(content)], walkArea: content.street.walkArea };
}

function yardDef(content: Content, projectId: ProjectId): SpaceDef {
  const house = content.street.houses.find(candidate => candidate.projectId === projectId);
  if (!house?.wanderPoints || house.door.target.scene !== 'interior') throw new Error(`No yard for house "${projectId}"`);
  const residentPetId = content.rooms[house.door.target.roomId]?.residentPetId;
  if (!residentPetId) throw new Error(`No resident for house "${projectId}"`);
  const [first] = house.wanderPoints;
  return { slots: [], wanderPoints: [...house.wanderPoints, ...meetingPoints(content)], walkArea: content.street.walkArea,
    petSpawn: { x: first.x, y: first.y, facing: 'right' }, residentPetId };
}

/** A pet's home: content `home`, else the room whose `residentPetId` is the pet. */
export function homeSpaceOf(content: Content, petId: PetId): DecorRef {
  const home = content.pets[petId]?.home;
  if (home?.kind === 'space') return siteRef(home.siteId);
  if (home?.kind === 'room') return roomRef(home.roomId);
  const room = Object.values(content.rooms).find(candidate => candidate.residentPetId === petId);
  if (!room) throw new Error(`Missing home for pet ${petId}`);
  return roomRef(room.id);
}

export function placementsOf(state: GameState, ref: SpaceRef): Record<SlotId, CharmTypeId> {
  if (ref.kind === 'yard') return {}; // a yard has no slots
  return ref.kind === 'room' ? state.rooms[ref.roomId].placements : state.spaces[ref.siteId].placements;
}

export function withSpacePlacements(state: GameState, ref: SpaceRef, placements: Record<SlotId, CharmTypeId>): GameState {
  if (ref.kind === 'yard') throw new Error('A yard has no placements');
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

/** The pet the player shares a scene with: the interior's resident while it is inside (an outside resident is on the street,
 * not in the room, until the presence roll brings it in), or on the street the resident of an arrived site. */
export function scenePet(content: Content, state: GameState): { petId: PetId; ref: SpaceRef } | null {
  if (state.scene.kind === 'interior') {
    const petId = content.rooms[state.scene.roomId]?.residentPetId;
    return petId && !state.pets[petId]?.outside ? { petId, ref: roomRef(state.scene.roomId) } : null;
  }
  const site = sitesOf(content).find(candidate => state.spaces[candidate.id]?.arrivalDone);
  return site ? { petId: site.residentPetId, ref: siteRef(site.id) } : null;
}

export const sameSpace = (a: SpaceRef, b: SpaceRef) =>
  a.kind === 'room' ? b.kind === 'room' && a.roomId === b.roomId
    : a.kind === 'site' ? b.kind === 'site' && a.siteId === b.siteId : b.kind === 'yard' && a.projectId === b.projectId;

/** `{ roomId }` or `{ siteId }` for an event naming exactly one of them. */
export function spaceKey(ref: SpaceRef): { roomId: RoomId } | { siteId: SiteId } {
  if (ref.kind === 'yard') throw new Error('A yard is not a decoratable space');
  return ref.kind === 'room' ? { roomId: ref.roomId } : { siteId: ref.siteId };
}
