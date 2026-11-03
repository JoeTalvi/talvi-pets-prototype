import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';
import { ItemSchema, type Item } from './charms';
export const ConditionSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('tag'), tag: Id, hidden: z.boolean().optional()
    }), z.object({
        kind: z.literal('adjacent'), tagA: Id, tagB: Id
    }), z.object({
        kind: z.literal('stars'), min: z.number()
    }), z.object({
        // DEC-046: met by greeting `withPetId`; evaluated only from WORK-036 (false until then)
        kind: z.literal('greeted'), withPetId: Id
    })
]);
export const RewardSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('items'), items: z.array(ItemSchema) // 1–2 entries: CHK-009-06
    }), z.object({
        kind: z.literal('verb'), verb: Id
    }), z.object({
        kind: z.literal('vignette')
    }), z.object({
        // DEC-044: unlocks an outdoor site
        kind: z.literal('space'), siteId: Id
    })
]);
/** Fork default 9 (v1.5): a want's reward is a list of 1–3 entries, at most one per kind. */
export const RewardListSchema = z.array(RewardSchema).min(1).max(3)
    .refine(list => new Set(list.map(entry => entry.kind)).size === list.length, 'At most one reward entry per kind');
export const WantSchema = z.object({
    id: Id, brief: z.string().min(1).max(60), conditions: z.array(ConditionSchema), reward: RewardListSchema, rewardLabel: z.string().max(40)
});
/** WORK-034-2: absent = the room whose `residentPetId` is the pet. */
export const HomeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('room'), roomId: Id }), z.object({ kind: z.literal('space'), siteId: Id })
]);
export const PetSchema = z.object({
    id: Id, name: z.string().min(1), portrait: AssetId, sheet: AssetId, home: HomeSchema.optional(), likes: z.array(z.object({
        tag: Id, weight: z.number(), hidden: z.boolean().optional()
    })).min(2).max(4), dislikes: z.array(Id), verbs: z.array(z.object({
        verb: Id, atStart: z.boolean()
    })), lines: z.object({
        greeting: z.array(z.string()), chatter: z.array(z.string()), dislike: z.array(z.string()), intro: z.array(z.string()), wantAnnounce: z.record(z.string(), z.string()), vignettes: z.record(z.string(), z.array(z.string())),
        // DEC-043 / OQ-26 (WORK-033-2): the stripped-charm reaction's line, 1–3 entries
        stripped: z.array(z.string().min(1).max(140)).min(1).max(3)
    }), wants: z.array(WantSchema),
    // DEC-046 / gate Q10(a) (WORK-036-1): greeting compatibility per other pet, 0..1; optional so minimal content parses,
    // completeness and symmetry are CHK-007-14..16
    compatibility: z.record(Id, z.number().min(0).max(1)).optional()
});
export type Pet = z.infer<typeof PetSchema>;
export type Want = z.infer<typeof WantSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Home = z.infer<typeof HomeSchema>;
export type RewardList = z.infer<typeof RewardListSchema>;
/** The items a want's reward grants (empty when it has no `items` entry). */
export const rewardItems = (want: { reward: RewardList }): Item[] =>
    want.reward.flatMap(entry => entry.kind === 'items' ? entry.items : []);
