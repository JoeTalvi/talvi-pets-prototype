/** Manual transcription of core.md v1.4 §2, §3, §5. Full selector work is pending. */
export const CONTRACT_VERSION = '1.4' as const;
export const actionNames = [
  'tick', 'setDesignMode', 'placeCharm', 'removeCharm', 'acknowledgeProject',
  'cutsceneFinished', 'collectRewards', 'skipWait', 'closeReveal', 'arrivalFinished',
  'advanceDialogue', 'tapPet', 'debugSimulatePurchase', 'debugSetEventInterval',
  'debugSetFeedPresentation', 'debugSetSeed', 'debugSetCurrent', 'debugJumpPhase',
  'debugCompleteProject', 'debugUnlockAllTypes', 'debugSetStarsVisible', 'debugSetMuted',
  'debugSetTesterLabel', 'reset',
] as const;
export const eventNames = [
  'scene.changed', 'mode.changed', 'charm.placed', 'charm.removed', 'stars.changed',
  'stars.visibilityChanged', 'want.activated', 'want.progressed', 'want.hiddenRevealed',
  'want.fulfilled', 'heart.earned', 'wants.exhausted', 'types.unlocked', 'verb.unlocked',
  'roundup.fired', 'phase.reached', 'feed.stopped', 'celebration.started', 'celebration.stepped',
  'completeNow.shown', 'completeNow.taken', 'rewards.collected', 'project.completed',
  'celebration.ended', 'arrival.started', 'arrival.finished', 'pet.reacted', 'pet.phaseChanged',
  'pet.verbStarted', 'pet.verbEnded', 'pet.wantBubble', 'pet.tapped', 'dialogue.opened',
  'dialogue.advanced', 'dialogue.closed', 'audio.muteChanged',
  'debug.applied', 'state.reset', 'action.rejected',
] as const;
export const selectorNames = [
  'inputFrozen', 'doorEnabled', 'residentPet', 'petUsingSlot', 'boundaryCents', 'phaseOf',
  'owedPhases', 'activeProjectId', 'hudProjectId', 'completeNowPriceCents', 'completeNowOffered',
  'ackFloorCents', 'attentionVisible', 'displayedPhase', 'typeUnlockPhase',
  'revealProjectId', 'revealView', 'revealPopupView', 'chooserTypes', 'ownsTag',
  'slotOf', 'placementAt', 'starsOf', 'activeWant', 'wantConditions', 'tagAvailability', 'missingWantTags',
] as const;
