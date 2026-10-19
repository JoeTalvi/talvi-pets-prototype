import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';
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
        kind: z.literal('types'), typeIds: z.array(Id)
    }), z.object({
        kind: z.literal('verb'), verb: Id
    }), z.object({
        kind: z.literal('vignette')
    })
]);
export const WantSchema = z.object({
    id: Id, brief: z.string().min(1).max(60), conditions: z.array(ConditionSchema), reward: RewardSchema, rewardLabel: z.string().max(40)
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
