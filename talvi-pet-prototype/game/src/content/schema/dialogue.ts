import { z } from 'zod';
export const DialogueSchema = z.object({
    orientation: z.array(z.string())
});
export type Dialogue = z.infer<typeof DialogueSchema>;
