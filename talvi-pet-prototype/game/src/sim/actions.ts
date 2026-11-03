import type { CharmTypeId, OutfitId, PetId, ProjectId, SiteId, SlotId } from './state';

/** Exact action vocabulary from core.md §2. Types do not imply implemented rules. */
export type Action =
  | { type: 'tick'; dtMs: number; move: { x: number; y: number } }
  | { type: 'setDesignMode'; on: boolean }
  | { type: 'placeCharm'; slotId: SlotId; typeId: CharmTypeId }
  | { type: 'removeCharm'; slotId: SlotId }
  | { type: 'acknowledgeProject'; projectId: ProjectId }
  | { type: 'cutsceneFinished' }
  | { type: 'collectRewards' }
  | { type: 'skipWait' }
  | { type: 'closeReveal' }
  | { type: 'arrivalFinished' }
  | { type: 'advanceDialogue' }
  | { type: 'tapPet'; petId: PetId }
  | { type: 'chooseOutfit'; outfitId: OutfitId }           // WORK-037-2 (MEC-001)
  | { type: 'debugSimulatePurchase' }
  | { type: 'debugSetEventInterval'; ms: number | null }
  | { type: 'debugSetFeedPresentation'; mode: 'events' | 'trickle' }
  | { type: 'debugSetSeed'; seed: number }
  | { type: 'debugSetCurrent'; projectId: ProjectId; cents: number }
  | { type: 'debugJumpPhase'; projectId: ProjectId }
  | { type: 'debugCompleteProject'; projectId: ProjectId }
  | { type: 'debugUnlockAllTypes' }
  | { type: 'debugGrantCopies'; typeId: CharmTypeId; count: number }
  | { type: 'debugUnlockSpace'; siteId: SiteId }
  | { type: 'debugFillSpace'; siteId: SiteId }
  | { type: 'debugFulfilActiveWant'; petId: PetId }
  | { type: 'debugSetStarsVisible'; on: boolean }
  | { type: 'debugSetMuted'; on: boolean }
  | { type: 'debugSetTesterLabel'; text: string }
  | { type: 'debugSetOutfit'; outfitId: OutfitId }         // WORK-037-2: debug row 25 "Outfits"
  | { type: 'reset'; seed?: number }
  | { type: 'debugSetPetsOutside'; mode: 'roll' | 'all' | 'none' }; // WORK-035-1: MEC-010 row 23 "Pets outside" 

export type TickAction = Extract<Action, { type: 'tick' }>;
export type SceneAction = Extract<Action, { type: 'tick' | 'setDesignMode' }>;
