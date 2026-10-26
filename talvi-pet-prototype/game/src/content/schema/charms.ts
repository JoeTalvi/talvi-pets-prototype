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
    standsOnFloor: z.boolean().optional()
});
export const CharmsSchema = z.object({
    types: z.array(CharmTypeSchema), starterSet: z.array(Id)
});
export type CharmType = z.infer<typeof CharmTypeSchema>;
export type Charms = z.infer<typeof CharmsSchema>;
