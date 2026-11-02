import { z } from 'zod';
import { Id, SizeClassSchema } from './common';
import { AssetId } from './assets';
export const CharmTypeSchema = z.object({
    id: Id, name: z.string().min(1).max(40), description: z.string().min(1).max(120), sizeClass: SizeClassSchema, tags: z.array(Id), sprite: AssetId,
    // A type whose art outgrows its class canvas (the bookshelf, play-session Q3) names its own; ASSET-013 checks against it.
    canvas: z.object({ w: z.number().int().positive().max(2048), h: z.number().int().positive().max(2048) }).optional(),
    // Height above the charm's base where a pet using it is drawn (lying on the cushion, sitting on the stool).
    seat: z.object({ y: z.number().int().nonnegative() }).optional(),
    // A wall charm that stands on the floor against the wall (the bookshelf) instead of hanging at the slot.
    standsOnFloor: z.boolean().optional(),
    // The wall a non-painting wall charm's art is drawn for (WORK-032-2 fix 5); absent = 'left', mirrored on the other wall.
    wallArtFacing: z.enum(['left', 'right']).optional()
});
/** DEC-043 (CONTRACT-CONTENT v1.5): every award names copies, `{ typeId, count }`, count an integer 1..9. */
export const ItemSchema = z.object({ typeId: Id, count: z.number().int().min(1).max(9) });
export const CharmsSchema = z.object({
    types: z.array(CharmTypeSchema), starterSet: z.array(ItemSchema)
});
export type Item = z.infer<typeof ItemSchema>;
/** The type ids an award list names, in list order (duplicates kept). */
export const itemTypeIds = (items: readonly Item[]): string[] => items.map(item => item.typeId);
export type CharmType = z.infer<typeof CharmTypeSchema>;
export type Charms = z.infer<typeof CharmsSchema>;
