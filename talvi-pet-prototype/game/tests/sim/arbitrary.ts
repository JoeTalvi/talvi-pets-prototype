import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import { mulberry32 } from '../../src/sim/rng';
import { ackFloorCents, activeProjectId, attentionVisible, chooserTypes, completeNowOffered } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';

/** Valid placeCharm/removeCharm in the current interior: a type of the slot's class with a copy available. */
function decorate(content: Content, state: GameState, value: number): Action {
  const roomId = (state.scene as { roomId: string }).roomId;
  const slots = content.rooms[roomId].slots;
  const slot = slots[Math.floor(value * slots.length)];
  const filled = state.rooms[roomId].placements[slot.id] !== undefined;
  // DEC-043: only a type with a copy in hand (or the slot's own type, a same-type replace) is placeable.
  const choices = chooserTypes(content, state, slot.id).filter(type =>
    state.inventory.counts[type.id] > 0 || state.rooms[roomId].placements[slot.id] === type.id);
  if (filled && ((value * 7) % 1 < 0.3 || choices.length === 0)) return { type: 'removeCharm', slotId: slot.id };
  if (choices.length === 0) return { type: 'setDesignMode', on: false };
  return { type: 'placeCharm', slotId: slot.id, typeId: choices[Math.floor(((value * 13) % 1) * choices.length)].id };
}

/** WORK-003-4: the view-timing action for the current celebration step (Skip taken sometimes). */
function celebrationStep(content: Content, state: GameState, value: number): Action {
  const step = state.celebration!.step;
  if (step === 'cutscene') return { type: 'cutsceneFinished' };
  if (step === 'reveal') return { type: 'closeReveal' };
  return completeNowOffered(content, state) && value < 0.4 ? { type: 'skipWait' } : { type: 'collectRewards' };
}

/** WORK-003-4: valid debug actions; `reset` is drawn for sub-values below 0.07 (≈ 0.5 % of all actions). */
function debugAction(content: Content, state: GameState, value: number): Action {
  const project = content.projects.find(candidate => !candidate.completeAtStart)!;
  const floor = ackFloorCents(content, state, project.id);
  const atGoal = state.projects[project.id].currentCents >= project.goalCents;
  if (value < 0.07) return { type: 'reset' };
  if (value < 0.4) return { type: 'debugSetCurrent', projectId: project.id,
    cents: floor + Math.floor(((value * 31) % 1) * (project.goalCents - floor + 1)) };
  if (value < 0.5 && activeProjectId(content, state) !== null) return { type: 'debugSimulatePurchase' };
  if (value < 0.6 && !atGoal) return { type: 'debugCompleteProject', projectId: project.id };
  if (value < 0.65 && !atGoal) return { type: 'debugJumpPhase', projectId: project.id };
  if (value < 0.75) return { type: 'debugSetEventInterval', ms: value < 0.7 ? null : 250 + Math.floor(value * 20000) };
  if (value < 0.8) return { type: 'debugUnlockAllTypes' };
  if (value < 0.82) return { type: 'debugSetFeedPresentation', mode: value < 0.81 ? 'trickle' : 'events' };
  if (value < 0.84) return { type: 'debugSetSeed', seed: Math.floor(value * 100000) };
  if (value < 0.85) return { type: 'debugSetTesterLabel', text: `tester-${Math.floor(value * 1000)}` };
  return value < 0.92 ? { type: 'debugSetStarsVisible', on: value < 0.88 } : { type: 'debugSetMuted', on: value < 0.96 };
}

/** Bounded FX-ARB precursor (WORK-003-1): ticks, setDesignMode and valid placeCharm/removeCharm;
 * WORK-003-2 advances any open dialogue first, so every generated action stays valid;
 * WORK-003-3 adds a valid tapPet (resident pet, no dialogue, no celebration).
 * WORK-003-4 adds the celebration steps, arrivalFinished, acknowledgeProject when the icon shows, and the
 * debug family (draws ≥ 0.93); `progress: false` leaves those out except the steps of a running celebration. Targeted motion ensures both doors and design are exercised. */
export function nextAction(content: Content, state: GameState, seed: number, progress = true): {
  action: Action; seed: number;
} {
  const draw = mulberry32(seed);
  if (state.dialogue.current !== null) return { action: { type: 'advanceDialogue' }, seed: draw.seed };
  if (state.celebration !== null) return { action: celebrationStep(content, state, draw.value), seed: draw.seed };
  if (state.arrival !== null) return { action: { type: 'arrivalFinished' }, seed: draw.seed };
  const owed = content.projects.find(project => attentionVisible(content, state, project.id));
  if (progress && owed && draw.value < 0.3)
    return { action: { type: 'acknowledgeProject', projectId: owed.id }, seed: draw.seed };
  if (progress && draw.value >= 0.93)
    return { action: debugAction(content, state, (draw.value - 0.93) / 0.07), seed: draw.seed };
  if (state.scene.kind === 'interior' && draw.value < 0.2)
    return { action: { type: 'setDesignMode', on: state.mode !== 'design' }, seed: draw.seed };
  if (state.scene.kind === 'interior' && state.celebration === null && draw.value < 0.25)
    return { action: { type: 'tapPet', petId: content.rooms[state.scene.roomId].residentPetId }, seed: draw.seed };
  if (state.mode === 'design')
    return draw.value < 0.75 ? { action: decorate(content, state, (draw.value - 0.2) / 0.55), seed: draw.seed }
      : { action: { type: 'tick', dtMs: 100, move: { x: 1, y: 0 } }, seed: draw.seed };
  const door = state.scene.kind === 'street'
    ? content.street.houses[0].door : content.rooms[state.scene.roomId].doors[0];
  const dx = door.rect.x + door.rect.w / 2 - state.avatar.x;
  const dy = door.rect.y + door.rect.h / 2 - state.avatar.y;
  const divisor = Math.max(Math.hypot(dx, dy), content.tuning.avatarSpeedRu * content.tuning.roomUnitPx / 10);
  const move = draw.value < 0.85 ? { x: dx / divisor, y: dy / divisor }
    : { x: Math.cos(draw.value * Math.PI * 2), y: Math.sin(draw.value * Math.PI * 2) };
  return { action: { type: 'tick', dtMs: 100, move }, seed: draw.seed };
}
