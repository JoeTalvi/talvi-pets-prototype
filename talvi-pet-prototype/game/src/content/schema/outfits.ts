import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';

/** WORK-037-2 (DEC-047, DEC-002): whole avatar outfits; `default` is the base sheet, every other set is granted by one beat. */
export const OutfitSchema = z.object({ id: Id, nameKey: z.string(), sheet: AssetId });
export const OutfitsSchema = z.object({ outfits: z.array(OutfitSchema).min(1) });
export type Outfit = z.infer<typeof OutfitSchema>;
export type Outfits = z.infer<typeof OutfitsSchema>;
