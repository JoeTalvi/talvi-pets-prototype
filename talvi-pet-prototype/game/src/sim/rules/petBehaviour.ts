import type { Content } from '../../content/types';
import type { SimEvent } from '../events';
import { mulberry32 } from '../rng';
import type { GameState, PetBehaviour, PetId } from '../state';

/** Shared write primitives for pets.ts, reactions.ts and bubbles.ts (MEC-007 §2, MEC-008 §2.2):
 * every random draw goes through the pet stream `pets[p].rngState` (TECH-008). */
export type PetDraw = { value: number; state: GameState };

export function petDraw(state: GameState, petId: PetId): PetDraw {
  const pet = state.pets[petId];
  const { value, seed } = mulberry32(pet.rngState);
  return { value, state: { ...state, pets: { ...state.pets, [petId]: { ...pet, rngState: seed } } } };
}

/** One uniform draw over `items` (callers guarantee a non-empty list). */
export function petPick<T>(state: GameState, petId: PetId, items: readonly T[]): { item: T; state: GameState } {
  const draw = petDraw(state, petId);
  return { item: items[Math.floor(draw.value * items.length)], state: draw.state };
}

/** Uniform integer in `[min, max]` from one pet draw. */
export function petRoll(state: GameState, petId: PetId, range: { min: number; max: number }): { ms: number; state: GameState } {
  const draw = petDraw(state, petId);
  return { ms: range.min + Math.floor(draw.value * (range.max - range.min + 1)), state: draw.state };
}

export function withBehaviour(state: GameState, petId: PetId, behaviour: PetBehaviour): GameState {
  return { ...state, pets: { ...state.pets, [petId]: { ...state.pets[petId], behaviour } } };
}

export function phaseChanged(petId: PetId, from: PetBehaviour['phase'], to: PetBehaviour): SimEvent {
  return { type: 'pet.phaseChanged', petId, from, to: to.phase, target: to.target, verb: to.verb, reaction: to.reaction };
}

/** `idle` with a fresh `idleMs` roll, standing where the pet is. */
export function toIdle(content: Content, state: GameState, petId: PetId): { behaviour: PetBehaviour; state: GameState } {
  const roll = petRoll(state, petId, content.tuning.idleMs);
  const { x, y, facing } = state.pets[petId].behaviour;
  return { state: roll.state,
    behaviour: { phase: 'idle', x, y, facing, timerMs: roll.ms, target: null, verb: null, reaction: null } };
}
