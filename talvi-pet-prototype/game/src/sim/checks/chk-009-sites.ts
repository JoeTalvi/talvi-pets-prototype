import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
import { ownedAfterUnlock, type Owned } from './chk-009-17';

/** WORK-034-2 (DEC-044/046): homes, site unlocks, 8 ★ reachable at the unlock, `greeted` last (CHK-009-18..21). */
export function check009Sites(c: Content): Finding[] {
  return [...checkHomes(c), ...checkUnlocks(c), ...checkArrivalStars(c), ...checkGreetedLast(c)];
}

/** CHK-009-18: every pet has exactly one home; space and room homes agree with their resident. */
function checkHomes(c: Content): Finding[] {
  const out: Finding[] = [];
  const add = (file: string, path: string, msg: string) => out.push(finding('CHK-009-18', 'error', file, path, msg));
  for (const pet of Object.values(c.pets)) {
    const f = `pets/${pet.id}.json`, home = pet.home;
    const rooms = Object.values(c.rooms).filter(room => room.residentPetId === pet.id);
    const sites = (c.street.sites ?? []).filter(site => site.residentPetId === pet.id);
    if (home?.kind === 'space') {
      const site = (c.street.sites ?? []).find(candidate => candidate.id === home.siteId);
      if (!site || site.residentPetId !== pet.id) add(f, '/home', `Site "${home.siteId}" must exist and name "${pet.id}" as its resident`);
      if (rooms.length) add(f, '/home', `A space-homed pet must not also be a room resident (${rooms.map(r => r.id).join(', ')})`);
    } else if (home?.kind === 'room') {
      if (c.rooms[home.roomId]?.residentPetId !== pet.id) add(f, '/home', `Room "${home.roomId}" must name "${pet.id}" as its resident`);
    } else if (rooms.length !== 1) add(f, '/home', `Pet needs exactly one home (rooms naming it: ${rooms.length})`);
    if (home?.kind !== 'space' && sites.length) add(f, '/home', `Pet is a site resident (${sites.map(s => s.id).join(', ')}) but its home is not that site`);
  }
  (c.street.sites ?? []).forEach((site, i) => {
    const home = c.pets[site.residentPetId]?.home;
    if (!c.pets[site.residentPetId] || home?.kind !== 'space' || home.siteId !== site.id)
      add('street.json', `/sites/${i}/residentPetId`, `Resident "${site.residentPetId}" must exist with home space "${site.id}"`);
  });
  return out;
}

/** CHK-009-19: each site is unlocked by exactly one want (reward kind `space`) across pets. */
function checkUnlocks(c: Content): Finding[] {
  return (c.street.sites ?? []).flatMap((site, i) => {
    const count = Object.values(c.pets).flatMap(pet => pet.wants)
      .filter(want => want.reward.some(entry => entry.kind === 'space' && entry.siteId === site.id)).length;
    return count === 1 ? [] : [finding('CHK-009-19', 'error', 'street.json', `/sites/${i}`,
      `Site "${site.id}" must be unlocked by exactly one want (found ${count})`)];
  });
}

/** Max Stars over the site's slot mix from `owned`: distinct types per size class first, then repeat copies. */
function reachableStars(c: Content, slots: { sizeClass: string }[], owned: Owned): number {
  const { starsFirstCopy, starsRepeat } = c.tuning;
  let points = 0;
  for (const sizeClass of new Set(slots.map(slot => slot.sizeClass))) {
    const free = slots.filter(slot => slot.sizeClass === sizeClass).length;
    const types = c.charms.types.filter(type => type.sizeClass === sizeClass && (owned[type.id] ?? 0) > 0);
    const firsts = Math.min(free, types.length);
    const copies = types.reduce((sum, type) => sum + owned[type.id], 0);
    points += firsts * starsFirstCopy + Math.min(free - firsts, copies - firsts) * starsRepeat;
  }
  return points;
}

/** CHK-009-20: `arrivalAtStars` ≤ the site's max, and reachable from the copies owned at the unlock want's fulfilment. */
function checkArrivalStars(c: Content): Finding[] {
  const out: Finding[] = [];
  (c.street.sites ?? []).forEach((site, i) => {
    const max = site.slots.length * c.tuning.starsFirstCopy, owned = ownedAfterUnlock(c, site.id);
    const reach = owned ? reachableStars(c, site.slots, owned) : -1;
    if (site.arrivalAtStars > max || (owned && reach < site.arrivalAtStars))
      out.push(finding('CHK-009-20', 'error', 'street.json', `/sites/${i}/arrivalAtStars`,
        `arrivalAtStars ${site.arrivalAtStars} must be ≤ ${max} and reachable at the unlock (reachable ${reach})`,
        undefined, { max, reachable: reach }));
  });
  return out;
}

/** CHK-009-21: a `greeted` condition only in a pet's last want (gate fork 8: an inert want earlier blocks the rest). */
function checkGreetedLast(c: Content): Finding[] {
  return Object.values(c.pets).flatMap(pet => pet.wants.flatMap((want, i) =>
    i < pet.wants.length - 1 && want.conditions.some(condition => condition.kind === 'greeted')
      ? [finding('CHK-009-21', 'error', `pets/${pet.id}.json`, `/wants/${i}/conditions`, `"greeted" is allowed only in the last want`)] : []));
}
