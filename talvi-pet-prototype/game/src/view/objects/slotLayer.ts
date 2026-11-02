import type Phaser from 'phaser';
import type { Slot } from '@content/schema/room';
import type { CharmType } from '@content/schema/charms';
import type { CharmSprite } from './CharmSprite';
import { SlotOutline } from './SlotOutline';

/** WORK-034-3: the slot machinery an interior room and a street site share (outline map, slot hit test, charm depth and motion). */
export const POP_MS = 180;
export const REMOVE_FADE_MS = 120;

/** Presentation §6.2: one outline per slot, shown by `mode` (a reload in design mode shows them, MEC-001 R7). */
export function createOutlines(scene: Phaser.Scene, slots: readonly Slot[], design: boolean): Map<string, SlotOutline> {
  const outlines = new Map<string, SlotOutline>();
  for (const slot of slots) {
    const outline = new SlotOutline(scene, slot);
    outline.setShown(design);
    outlines.set(slot.id, outline);
  }
  return outlines;
}

/** Outline state from placements and the slot the chooser/sheet holds (`context.selectedSlotId`). */
export function syncOutlineStates(outlines: Map<string, SlotOutline>, placements: Record<string, string>, selected: string | null): void {
  for (const [slotId, outline] of outlines) outline.setOutlineState(slotId === selected ? 'selected' : placements[slotId] ? 'filled' : 'empty');
}

/** The top-most visible outline under the point. */
export function outlineAt(outlines: Map<string, SlotOutline>, x: number, y: number): SlotOutline | undefined {
  let top: SlotOutline | undefined;
  for (const outline of outlines.values()) if (outline.contains(x, y) && (!top || outline.depth > top.depth)) top = outline;
  return top;
}

/** MEC-005 R15: depth = the floor line for a floor-standing charm, else `depthOverride ?? y`. */
export function charmDepth(slot: Slot, type: Pick<CharmType, 'standsOnFloor'>): number {
  return type.standsOnFloor && slot.floorY !== undefined ? slot.floorY : slot.depthOverride ?? slot.y;
}

/** `charm.placed`: the pop-in. */
export function popCharm(scene: Phaser.Scene, sprite: CharmSprite): void {
  scene.tweens.add({ targets: sprite, scale: { from: 0.6, to: 1 }, duration: POP_MS, ease: 'Back.easeOut' });
}

/** `charm.removed`: the fade-out, then the sprite is destroyed. */
export function fadeCharm(scene: Phaser.Scene, sprite: CharmSprite): void {
  scene.tweens.add({ targets: sprite, alpha: 0, duration: REMOVE_FADE_MS, onComplete: () => sprite.destroy() });
}
