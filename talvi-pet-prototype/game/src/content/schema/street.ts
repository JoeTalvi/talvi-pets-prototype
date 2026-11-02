import { z } from 'zod';
import { Id, PointSchema, DoorSchema, SpawnSchema } from './common';
import { AssetId } from './assets';
/** WORK-032-1: axis-aligned solid footprint, half-open like door rects; the avatar never ends a street tick inside one. */
export const BlockerSchema = z.object({
    x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive()
});
export const HouseSchema = PointSchema.extend({
    projectId: Id, stageSprites: z.array(AssetId).length(6), door: DoorSchema, attentionAnchor: PointSchema, arrivalPath: z.array(PointSchema),
    blockers: z.array(BlockerSchema).default([])
});
export const StreetSchema = z.object({
    walkArea: z.array(PointSchema), playerSpawn: SpawnSchema, houses: z.array(HouseSchema), groundTiles: z.array(PointSchema.extend({
        sprite: AssetId
    })), props: z.array(PointSchema.extend({
        sprite: AssetId
    }))
});
export type Street = z.infer<typeof StreetSchema>;
