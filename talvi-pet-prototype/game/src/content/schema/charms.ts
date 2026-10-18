import { z } from 'zod';
import { Id, SizeClassSchema } from './common';
import { AssetId } from './assets';
export const CharmTypeSchema = z.object({
    id: Id, name: z.string().min(1).max(40), description: z.string().min(1).max(120), sizeClass: SizeClassSchema, tags: z.array(Id), sprite: AssetId
});
export const CharmsSchema = z.object({
    types: z.array(CharmTypeSchema), starterSet: z.array(Id)
});
export type CharmType = z.infer<typeof CharmTypeSchema>;
export type Charms = z.infer<typeof CharmsSchema>;
