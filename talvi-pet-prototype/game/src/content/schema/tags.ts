import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';
export const TagSchema = z.object({
    id: Id, name: z.string().min(1), icon: AssetId
});
export const TagsSchema = z.object({
    tags: z.array(TagSchema)
});
export type Tag = z.infer<typeof TagSchema>;
export type Tags = z.infer<typeof TagsSchema>;
