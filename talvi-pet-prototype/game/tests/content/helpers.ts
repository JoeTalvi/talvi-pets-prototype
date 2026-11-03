import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AssetManifest } from '../../src/content/schema/assets';
import { loadContent, type Content, type ContentFiles } from '../../src/content/load';
export const fixtureRoot = 'tests/fixtures/content-min';
export const manifest = AssetManifest.parse(JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8')));
export function files(): ContentFiles {
    const data: ContentFiles = {};
    for (const name of readdirSync(fixtureRoot).filter(f => f.endsWith('.json') && f !== 'manifest.json'))
        data[name] = JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8'));
    for (const dir of [
        'rooms', 'pets'
    ])
        for (const name of readdirSync(join(fixtureRoot, dir)))
            data[dir + '/' + name] = JSON.parse(readFileSync(join(fixtureRoot, dir, name), 'utf8'));
    return data;
}
export const validContent = () => loadContent(manifest, files());
export type Patch = {
    file: string;
    path: string;
    value?: unknown;
    remove?: boolean;
};
export function patchFiles(data: ContentFiles, patch: Patch[]): ContentFiles {
    const result = structuredClone(data);
    for (const p of patch) {
        const parts = p.path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
        let parent = result[p.file] as Record<string, unknown>;
        for (const part of parts.slice(0, -1))
            parent = parent[part] as Record<string, unknown>;
        const key = parts.at(-1)!;
        if (p.remove) {
            if (Array.isArray(parent))
                parent.splice(Number(key), 1);
            else
                delete parent[key];
        }
        else
            parent[key] = p.value;
    }
    return result;
}
/** Invalid-data tests deliberately bypass parsing to exercise the registry independently. */
export function rawContent(f: ContentFiles): Content {
    return {
        tags: (f['tags.json'] as {
            tags: Content['tags'];
        }).tags, charms: f['charms.json'], verbs: (f['verbs.json'] as {
            verbs: Content['verbs'];
        }).verbs, street: { sites: [], ...(f['street.json'] as object) } as unknown as Content['street'], projects: (f['projects.json'] as {
            projects: Content['projects'];
        }).projects, merchants: (f['merchants.json'] as {
            merchants: Content['merchants'];
        }).merchants, dialogue: f['dialogue.json'], strings: f['strings.json'], tuning: f['tuning.json'], outfits: (f['outfits.json'] as { outfits?: Content['outfits'] } | undefined)?.outfits ?? [], rooms: Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('rooms/')).map(([k, v]) => [
            k.slice(6, -5), v
        ])), pets: Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith('pets/')).map(([k, v]) => [
            k.slice(5, -5), v
        ]))
    } as Content;
}
