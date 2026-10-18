import { z } from 'zod';
export const StringsSchema = z.record(z.string(), z.string());
export type Strings = z.infer<typeof StringsSchema>;
export const RequiredDialogueKeys = [
    'tpp.bubble.love', 'tpp.bubble.like', 'tpp.bubble.dislike', 'tpp.bubble.interrupted', 'tpp.bubble.greeting', 'tpp.bubble.want', 'tpp.bubble.wantHidden', 'tpp.bubble.chatter', 'tpp.dialogue.continue', 'tpp.dialogue.gameName'
] as const;
