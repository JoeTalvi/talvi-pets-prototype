import type { z } from 'zod';
import { TagsSchema } from './schema/tags';
import { CharmsSchema } from './schema/charms';
import { VerbsSchema } from './schema/verbs';
import { RoomSchema } from './schema/room';
import { StreetSchema } from './schema/street';
import { PetSchema } from './schema/pet';
import { ProjectsSchema } from './schema/project';
import { MerchantsSchema } from './schema/merchant';
import { DialogueSchema } from './schema/dialogue';
import { StringsSchema } from './schema/strings';
import { TuningSchema } from './schema/tuning';
import type { AssetManifest } from './schema/assets';
import { resolveContent } from './resolve';
import { pointer, type Content, type ContentFiles, type ContentIssue } from './types';
export type { Content, ContentFiles, ContentIssue } from './types';
export class ContentError extends Error {
    constructor(public readonly issues: ContentIssue[]) {
        super(issues.map(i => `${i.file}:${pointer(i.path)} ${i.message}`).join('\n'));
        this.name = 'ContentError';
    }
}
// Vite replaces the glob at build time. Node tools supply files explicitly.
const bundled = import.meta.env !== undefined ? import.meta.glob('./**/*.json', {
    eager: true, import: 'default'
}) : {};
export function loadContent(manifest?: AssetManifest, files: ContentFiles = Object.fromEntries(Object.entries(bundled).map(([p, v]) => [
    p.slice(2), v
]))): Content {
    const issues: ContentIssue[] = [];
    function parse<T extends z.ZodType>(file: string, schema: T): z.infer<T> {
        const result = schema.safeParse(files[file]);
        if (!result.success) {
            issues.push(...result.error.issues.map(i => ({
                code: i.code, file, path: i.path.map(p => typeof p === 'number' ? p : String(p)), message: i.message
            })));
            return undefined as z.infer<T>;
        }
        return result.data;
    }
    const tags = parse('tags.json', TagsSchema), charms = parse('charms.json', CharmsSchema), verbs = parse('verbs.json', VerbsSchema), street = parse('street.json', StreetSchema), projects = parse('projects.json', ProjectsSchema), merchants = parse('merchants.json', MerchantsSchema), dialogue = parse('dialogue.json', DialogueSchema), strings = parse('strings.json', StringsSchema), tuning = parse('tuning.json', TuningSchema);
    const roomFiles = Object.keys(files).filter(f => /^rooms\/[^/]+\.json$/.test(f)).sort(), petFiles = Object.keys(files).filter(f => /^pets\/[^/]+\.json$/.test(f)).sort();
    if (!roomFiles.length)
        issues.push({
            code: 'custom', file: 'rooms', path: [], message: 'At least one room file is required'
        });
    if (!petFiles.length)
        issues.push({
            code: 'custom', file: 'pets', path: [], message: 'At least one pet file is required'
        });
    const rooms = Object.fromEntries(roomFiles.map(f => [
        f.slice(6, -5), parse(f, RoomSchema)
    ])), pets = Object.fromEntries(petFiles.map(f => [
        f.slice(5, -5), parse(f, PetSchema)
    ]));
    if (issues.length)
        throw new ContentError(issues);
    const content: Content = {
        tags: tags.tags, charms, verbs: verbs.verbs, rooms, street, pets, projects: projects.projects, merchants: merchants.merchants, dialogue, strings, tuning
    };
    const resolved = resolveContent(content, manifest);
    if (resolved.length)
        throw new ContentError(resolved);
    return content;
}
