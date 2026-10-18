import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AssetManifest } from '../../src/content/schema/assets';
import { ContentError, loadContent, type ContentFiles } from '../../src/content/load';
import { pointer } from '../../src/content/types';
import { registeredIds, runContentChecks, type Finding } from '../../src/sim/checks';
export type Args = {
    format: 'text' | 'json';
    content: string;
    manifest: string;
    out?: string;
    strict: boolean;
    only?: string[];
    room?: string;
    pet?: string;
    project?: string;
    help: boolean;
};
export function args(argv: string[], coverage = false): Args {
    const result: Args = {
        format: 'text', content: 'src/content', manifest: 'public/assets/manifest.json', strict: false, help: false
    };
    const values = new Set([
        'format', 'content', 'manifest', 'out', 'only', 'room', 'pet', ...(coverage ? [
            'project'
        ] : [])
    ]);
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (coverage && [
            '--panel', '--reveal', '--stars'
        ].includes(flag))
            throw new Error('This preview needs the sim kernel (WORK-003)');
        if (flag === '--strict') {
            result.strict = true;
            continue;
        }
        if (flag === '--help') {
            result.help = true;
            continue;
        }
        const key = flag.slice(2);
        if (!flag.startsWith('--') || !values.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--'))
            throw new Error(`Unknown flag or missing value: ${flag}`);
        const value = argv[++i];
        switch (key) {
            case 'format':
                if (value !== 'text' && value !== 'json')
                    throw new Error('format must be text|json');
                result.format = value;
                break;
            case 'only':
                result.only = value.split(',');
                break;
            case 'content':
            case 'manifest':
            case 'out':
            case 'room':
            case 'pet':
            case 'project':
                result[key] = value;
                break;
        }
    }
    validatePrefixes(result.only);
    return result;
}
export async function readContentFiles(dir: string): Promise<ContentFiles> {
    const resolved = await resolveInputPath(dir);
    const info = await stat(resolved);
    dir = resolved;
    if (info.isFile())
        return JSON.parse(await readFile(dir, 'utf8')) as ContentFiles;
    const files: ContentFiles = {};
    async function visit(part: string) {
        for (const entry of (await readdir(join(dir, part), {
            withFileTypes: true
        })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            const rel = join(part, entry.name);
            if (entry.isDirectory() && (part === '' && (entry.name === 'rooms' || entry.name === 'pets')))
                await visit(rel);
            else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json')
                files[rel] = JSON.parse(await readFile(join(dir, rel), 'utf8'));
        }
    }
    await visit('');
    return files;
}
export async function readInput(a: Args) {
    const files = await readContentFiles(a.content);
    const manifest = AssetManifest.parse(JSON.parse(await readFile(a.manifest, 'utf8')));
    return {
        files, manifest
    };
}
export function evaluate(files: ContentFiles, manifest: AssetManifest, a: Args) {
    try {
        const content = loadContent(manifest, files), findings = runContentChecks(content, manifest, a);
        const counts = {
            errors: findings.filter(f => f.level === 'error').length, warnings: findings.filter(f => f.level === 'warning').length, info: findings.filter(f => f.level === 'info').length, checks: registeredIds.filter(id => !a.only || a.only.some(p => id.startsWith(p))).length, files: Object.keys(files).length
        };
        const exitCode = counts.errors ? 1 : a.strict && counts.warnings ? 2 : 0;
        return {
            content, report: {
                ok: exitCode === 0, exitCode, zodIssues: [] as {
                    file: string;
                    path: string;
                    message: string;
                }[], findings, counts
            }
        };
    }
    catch (error) {
        if (!(error instanceof ContentError))
            throw error;
        return {
            content: undefined, report: {
                ok: false, exitCode: 1, zodIssues: error.issues.map(i => ({
                    file: i.file, path: pointer(i.path), message: i.message
                })), findings: [] as Finding[], counts: {
                    errors: error.issues.length, warnings: 0, info: 0, checks: 0, files: Object.keys(files).length
                }
            }
        };
    }
}
export const findingText = (f: Finding) => `${f.level.toUpperCase().padEnd(7)}  ${f.ids.join(',')}  ${f.file}:${f.path}  ${f.message}${f.hint ? '  → ' + f.hint : ''}`;
export async function output(a: Args, value: string) {
    if (a.out)
        await writeFile(a.out, value + '\n');
    else
        process.stdout.write(value + '\n');
}
export function fail(error: unknown) {
    process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n');
    process.exitCode = 3;
}
function validatePrefixes(only?: string[]): void {
    for (const prefix of only ?? [])
        if (prefix !== 'ZOD' && !registeredIds.some(id => id.startsWith(prefix)))
            throw new Error(`Unknown check prefix ${prefix}; known: ${registeredIds.join(', ')}`);
}
async function resolveInputPath(path: string): Promise<string> {
    try {
        await stat(path);
        return path;
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error;
        // The work-package acceptance example uses extensionless fixture bundles.
        if (!path.endsWith('.json')) {
            await stat(path + '.json');
            return path + '.json';
        }
        throw error;
    }
}
