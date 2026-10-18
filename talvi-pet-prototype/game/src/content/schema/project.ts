import { z } from 'zod';
import { Id } from './common';
import { AssetId } from './assets';
export const ProjectSchema = z.object({
    id: Id, name: z.string(), causeName: z.string(), goalCents: z.number(), completeAtStart: z.boolean(), interiorRoomId: Id, residentPetId: Id, phaseRewards: z.array(z.array(Id)), clueCards: z.array(z.object({
        icon: AssetId, line: z.string(), hintTag: Id.optional()
    })), descriptorImage: AssetId.optional(), silhouetteImage: AssetId.optional(), phaseMessages: z.array(z.array(z.string())).optional(), completionMessage: z.array(z.string()).optional()
});
export const ProjectsSchema = z.object({
    projects: z.array(ProjectSchema)
});
export type Project = z.infer<typeof ProjectSchema>;
export type Projects = z.infer<typeof ProjectsSchema>;
