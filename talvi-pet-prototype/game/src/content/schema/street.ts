import { z } from 'zod';
import { Id, PointSchema, DoorSchema, SpawnSchema, AnchorSchema } from './common';
import { SlotSchema } from './room';
import { AssetId } from './assets';
/** WORK-032-1: axis-aligned solid footprint, half-open like door rects; the avatar never ends a street tick inside one. */
export const BlockerSchema = z.object({
    x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive()
});
export const HouseSchema = PointSchema.extend({
    projectId: Id, stageSprites: z.array(AssetId).length(6), door: DoorSchema, attentionAnchor: PointSchema, arrivalPath: z.array(PointSchema),
    blockers: z.array(BlockerSchema).default([])
});
/** WORK-034-2 (DEC-044): one pre-placed outdoor site; small/large slots only, two wander points, a space-homed resident. */
export const SiteSchema = z.object({
    id: Id, x: z.number(), y: z.number(),
    art: z.object({ empty: AssetId, base: AssetId }),
    slots: z.array(SlotSchema.refine(slot => slot.sizeClass !== 'wall', 'site slots are small or large (DEC-044)')),
    wanderPoints: z.array(PointSchema.extend({ id: Id })).length(2),
    petSpawn: AnchorSchema, residentPetId: Id, arrivalPath: z.array(PointSchema).min(1),
    arrivalAtStars: z.number().int().positive(),
    // WORK-037-2 (DEC-047): the outfit the resident's arrival grants; absent = none
    arrivalOutfitId: Id.optional()
});
export const StreetSchema = z.object({
    walkArea: z.array(PointSchema), playerSpawn: SpawnSchema, houses: z.array(HouseSchema), groundTiles: z.array(PointSchema.extend({
        sprite: AssetId
    })), props: z.array(PointSchema.extend({
        sprite: AssetId
    })),
    sites: z.array(SiteSchema).default([])
});
export type Site = z.infer<typeof SiteSchema>;
export type Street = z.infer<typeof StreetSchema>;
