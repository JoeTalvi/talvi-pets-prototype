import { z } from 'zod';
import source from '../../public/assets/manifest.json';
// Loader boundary only; WORK-002 adds the complete shared registry schema.
const entry = z.object({ id: z.string(), type: z.enum(['image', 'spritesheet', 'audio', 'font']), url: z.string().optional(), urls: z.array(z.string()).optional(), frame: z.object({ w: z.number(), h: z.number() }).optional() }).passthrough();
export const manifest = z.object({ schemaVersion: z.literal(1), entries: z.array(entry) }).parse(source);
