import { z } from 'zod';
import { Id, PointSchema, DoorSchema, SpawnSchema } from './common';
import { AssetId } from './assets';
export const HouseSchema = PointSchema.extend({
    projectId: Id, stageSprites: z.array(AssetId).length(6), door: DoorSchema, attentionAnchor: PointSchema, arrivalPath: z.array(PointSchema)
});
export const StreetSchema = z.object({
    walkArea: z.array(PointSchema), playerSpawn: SpawnSchema, houses: z.array(HouseSchema), groundTiles: z.array(PointSchema.extend({
        sprite: AssetId
    })), props: z.array(PointSchema.extend({
        sprite: AssetId
    }))
});
export type Street = z.infer<typeof StreetSchema>;
