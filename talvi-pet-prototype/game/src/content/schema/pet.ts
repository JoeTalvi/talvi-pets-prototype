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
    })
]);
export const RewardSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('items'), items: z.array(ItemSchema) // 1–2 entries: CHK-009-06
    }), z.object({
        kind: z.literal('verb'), verb: Id
    }), z.object({
        kind: z.literal('vignette')
    })
]);
/** Fork default 9 (v1.5): a want's reward is a list of 1–3 entries, at most one per kind. */
export const RewardListSchema = z.array(RewardSchema).min(1).max(3)
    .refine(list => new Set(list.map(entry => entry.kind)).size === list.length, 'At most one reward entry per kind');
export const WantSchema = z.object({
    id: Id, brief: z.string().min(1).max(60), conditions: z.array(ConditionSchema), reward: RewardListSchema, rewardLabel: z.string().max(40)
});
export const PetSchema = z.object({
    id: Id, name: z.string().min(1), portrait: AssetId, sheet: AssetId, likes: z.array(z.object({
        tag: Id, weight: z.number(), hidden: z.boolean().optional()
    })).min(2).max(4), dislikes: z.array(Id), verbs: z.array(z.object({
        verb: Id, atStart: z.boolean()
    })), lines: z.object({
        greeting: z.array(z.string()), chatter: z.array(z.string()), dislike: z.array(z.string()), intro: z.array(z.string()), wantAnnounce: z.record(z.string(), z.string()), vignettes: z.record(z.string(), z.array(z.string()))
    }), wants: z.array(WantSchema)
});
export type Pet = z.infer<typeof PetSchema>;
export type Want = z.infer<typeof WantSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type RewardList = z.infer<typeof RewardListSchema>;
/** The items a want's reward grants (empty when it has no `items` entry). */
export const rewardItems = (want: { reward: RewardList }): Item[] =>
    want.reward.flatMap(entry => entry.kind === 'items' ? entry.items : []);
