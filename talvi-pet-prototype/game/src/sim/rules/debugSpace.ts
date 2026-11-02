import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult } from '../events';
import type { GameState } from '../state';
import { placementsOf, siteOf, siteRef } from '../space';
import { grantItems } from './inventory';
import { placeAt, type SlotsResult } from './slots';
import { maybeStartSiteArrival } from './sites';
import { starsOfSpace } from './stars';
import { activeWant, fulfil, unlockSpace } from './wants';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;
/** The reducer's placement chain (core §6.1), injected so this module does not import reduce.ts. */
export type RunPlacement = (content: Content, before: GameState, outcome: SlotsResult) => RuleResult;

const reject = (state: GameState, action: Action, reason: string): RuleResult =>
  ({ state, events: [{ type: 'action.rejected', action, reason }] });
const applied = (action: Action, result: RuleResult): RuleResult =>
  ({ state: result.state, events: [{ type: 'debug.applied', action }, ...result.events] });
const chain = (result: RuleResult, next: RuleResult): RuleResult =>
  ({ state: next.state, events: [...result.events, ...next.events] });
const knownSite = (content: Content, siteId: string) => content.street.sites.some(site => site.id === siteId);

/** The pet whose want rewards the site (else the site's resident): the `space.unlocked` petId of a debug unlock. */
function unlockerOf(content: Content, siteId: string): string {
  const owner = Object.values(content.pets).find(pet => pet.wants.some(want =>
    want.reward.some(entry => entry.kind === 'space' && entry.siteId === siteId)));
  return owner?.id ?? siteOf(content, siteId).residentPetId;
}

/** MEC-010 (WORK-034-2): unlock the site without its want. */
export function debugUnlockSpace(content: Content, state: GameState, action: ActionOf<'debugUnlockSpace'>): RuleResult {
  if (!knownSite(content, action.siteId)) return reject(state, action, 'unknownSite');
  return applied(action, unlockSpace(state, action.siteId, unlockerOf(content, action.siteId), null));
}

/** "Grant stars": for each empty slot in file order, one granted copy of the first catalogue type of its size class not
 * yet on the site, placed through the placement chain, until the site reaches `arrivalAtStars` or is full. */
export function debugFillSpace(content: Content, state: GameState, action: ActionOf<'debugFillSpace'>,
  runPlacement: RunPlacement): RuleResult {
  if (!knownSite(content, action.siteId)) return reject(state, action, 'unknownSite');
  if (!state.spaces[action.siteId].unlocked) return reject(state, action, 'siteLocked');
  const site = siteOf(content, action.siteId), ref = siteRef(site.id);
  let result: RuleResult = { state, events: [] };
  for (const slot of site.slots) {
    if (starsOfSpace(content, result.state, ref).points >= site.arrivalAtStars) break;
    const placements = placementsOf(result.state, ref);
    if (placements[slot.id] !== undefined) continue;
    const type = content.charms.types.find(candidate => candidate.sizeClass === slot.sizeClass &&
      !Object.values(placements).includes(candidate.id));
    if (!type) continue;
    result = chain(result, grantItems(content, result.state, [{ typeId: type.id, count: 1 }], 'debug'));
    result = chain(result, runPlacement(content, result.state, placeAt(content, result.state, ref, slot.id, type.id)));
  }
  return applied(action, chain(result, maybeStartSiteArrival(content, result.state)));
}

/** Gate fork 8: fulfil the pet's active want through `fulfil` (so `greeted` can be passed before WORK-036). */
export function debugFulfilActiveWant(content: Content, state: GameState, action: ActionOf<'debugFulfilActiveWant'>): RuleResult {
  if (!content.pets[action.petId]) return reject(state, action, 'unknownPet');
  if (activeWant(content, state, action.petId) === null) return reject(state, action, 'noActiveWant');
  const home = content.pets[action.petId].home;
  const slots = home?.kind === 'space' ? siteOf(content, home.siteId).slots
    : Object.values(content.rooms).find(room => room.residentPetId === action.petId)?.slots ?? [];
  return applied(action, fulfil(content, state, action.petId, slots[0]?.id ?? ''));
}
