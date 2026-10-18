import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';
export const MerchantSchema = z.object({
    id: Id, name: z.string(), icon: AssetId.optional(), minCents: z.number(), maxCents: z.number()
});
export const MerchantsSchema = z.object({
    merchants: z.array(MerchantSchema)
});
export type Merchant = z.infer<typeof MerchantSchema>;
export type Merchants = z.infer<typeof MerchantsSchema>;
