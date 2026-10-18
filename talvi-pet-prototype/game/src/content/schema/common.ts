import { z } from 'zod';
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const PointSchema = z.object({
    x: z.number(), y: z.number()
});
export const FacingSchema = z.enum([
    'left', 'right', 'up', 'down'
]);
export const SpawnSchema = PointSchema.extend({
    facing: FacingSchema
});
export const AnchorSchema = PointSchema.extend({
    facing: z.enum([
        'left', 'right'
    ])
});
export const SizeClassSchema = z.enum([
    'small', 'large', 'wall'
]);
export const DoorSchema = z.object({
    id: Id, rect: z.object({
        x: z.number(), y: z.number(), w: z.number(), h: z.number()
    }),
    target: z.discriminatedUnion('scene', [
        z.object({
            scene: z.literal('street'), doorId: Id
        }), z.object({
            scene: z.literal('interior'), roomId: Id, doorId: Id
        })
    ]), spawn: SpawnSchema
});
export type Point = z.infer<typeof PointSchema>;
export type Door = z.infer<typeof DoorSchema>;
