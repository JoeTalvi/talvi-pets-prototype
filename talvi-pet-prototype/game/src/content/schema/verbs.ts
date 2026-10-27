import { z } from 'zod';
import { Id } from './common';
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const Emoji = z.string().refine(s => [...segmenter.segment(s)].length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}]|[0-9#*]\uFE0F?\u20E3/u.test(s), 'emote must be one emoji');
/** CN-12 (APPROVAL-013): the pet sheet row the view plays while the pet uses a slot with this verb; `use-perch` is the global row 6 (gate fork Q-A). */
export const UseClip = z.enum(['use-sit', 'use-lie', 'use-look', 'use-perch']);
export const VerbSchema = z.object({
    id: Id, name: z.string().min(1), emote: Emoji, emoteText: z.string(), tags: z.array(Id).min(1), clip: UseClip
});
export const VerbsSchema = z.object({
    verbs: z.array(VerbSchema)
});
export type Verb = z.infer<typeof VerbSchema>;
export type Verbs = z.infer<typeof VerbsSchema>;
