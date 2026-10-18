import { z } from 'zod';
import { Id, PointSchema, DoorSchema, AnchorSchema, SizeClassSchema } from './common';
import { AssetId } from './assets';
export const SlotSchema = z.object({
    id: Id, sizeClass: SizeClassSchema, x: z.number(), y: z.number(), wall: z.enum([
        'left', 'right'
    ]).optional(), depthOverride: z.number().optional(), anchor: AnchorSchema, adjacent: z.array(Id)
}).superRefine((s, ctx) => {
    if (s.sizeClass === 'wall' && !s.wall)
        ctx.addIssue({
            code: 'custom', path: [
                'wall'
            ], message: 'wall slots require wall side'
        });
});
export const RoomSchema = z.object({
    id: Id, name: z.string().min(1), background: AssetId, walkArea: z.array(PointSchema), doors: z.array(DoorSchema).min(1).refine(doors => doors.some(d => d.target.scene === 'street'), 'room requires a door targeting street'), slots: z.array(SlotSchema), wanderPoints: z.array(PointSchema.extend({
        id: Id
    })), petSpawn: AnchorSchema, residentPetId: Id
});
export type Room = z.infer<typeof RoomSchema>;
export type Slot = z.infer<typeof SlotSchema>;
