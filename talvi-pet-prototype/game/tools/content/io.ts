import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AssetManifest } from '../../src/content/schema/assets';
import { ContentError, loadContent, type ContentFiles, type ContentIssue } from '../../src/content/load';
import { readKnownMissing, resolvedKnownMissing, type KnownMissing } from '../assets/common';
import { pointer } from '../../src/content/types';
import { registeredIds, runContentChecks, type Finding } from '../../src/sim/checks';
import { compareFindings, finding } from '../../src/sim/checks/types';
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
    knownMissing?: string;
    help: boolean;
};
export function args(argv: string[], coverage = false): Args {
    const result: Args = {
        format: 'text', content: 'src/content', manifest: 'public/assets/manifest.json', strict: false, help: false
    };
    const values = new Set([
        'format', 'content', 'manifest', 'out', 'only', 'room', 'pet', 'known-missing', ...(coverage ? [
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
            case 'known-missing':
                result.knownMissing = value;
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
    const knownMissing = a.knownMissing ? readKnownMissing(a.knownMissing) : undefined;
    return {
        files, manifest, knownMissing
    };
}
type ZodIssue = { file: string; path: string; message: string };
function buildReport(findings: Finding[], zodIssues: ZodIssue[], checks: number, fileCount: number, strict: boolean) {
    findings.sort(compareFindings);
    const counts = {
        errors: zodIssues.length + findings.filter(f => f.level === 'error').length, warnings: findings.filter(f => f.level === 'warning').length, info: findings.filter(f => f.level === 'info').length, checks, files: fileCount
    };
    const exitCode = counts.errors ? 1 : strict && counts.warnings ? 2 : 0;
    return { ok: exitCode === 0, exitCode, zodIssues, findings, counts };
}
const zodIssue = (i: ContentIssue): ZodIssue => ({ file: i.file, path: pointer(i.path), message: i.message });
const unresolvedAssetId = (i: ContentIssue) => i.ids?.[0] === 'CHK-CORE-03' ? /^Asset "(.+)" must resolve as /.exec(i.message)?.[1] : undefined;
/** Resolution issues for listed, absent IDs become warnings; wrong-type or unlisted IDs stay errors. */
function splitKnownMissing(issues: ContentIssue[], manifest: AssetManifest, a: Args, known?: KnownMissing) {
    const present = new Set(manifest.entries.map(e => e.id)), errors: ZodIssue[] = [], warnings: Finding[] = [];
    for (const issue of issues) {
        const id = unresolvedAssetId(issue), batch = id && !present.has(id) ? known?.get(id) : undefined;
        if (batch)
            warnings.push(finding(['ZOD', 'KNOWN-MISSING'], 'warning', issue.file, pointer(issue.path), issue.message, `later batch ${batch} (listed in ${a.knownMissing})`));
        else
            errors.push(zodIssue(issue));
    }
    const stale = known ? resolvedKnownMissing(known, present).map(id => finding('KNOWN-MISSING', 'info', a.knownMissing!, '', `${id} now resolves in the manifest; remove it from the list`)) : [];
    return { errors, warnings: [...warnings, ...stale] };
}
export function evaluate(files: ContentFiles, manifest: AssetManifest, a: Args, known?: KnownMissing) {
    const checks = registeredIds.filter(id => !a.only || a.only.some(p => id.startsWith(p))).length, fileCount = Object.keys(files).length;
    try {
        const content = loadContent(manifest, files), split = splitKnownMissing([], manifest, a, known);
        return { content, report: buildReport([...runContentChecks(content, manifest, a), ...split.warnings], [], checks, fileCount, a.strict) };
    }
    catch (error) {
        if (!(error instanceof ContentError))
            throw error;
        if (!error.issues.every(i => unresolvedAssetId(i)))
            return { content: undefined, report: buildReport([], error.issues.map(zodIssue), 0, fileCount, false) };
        // Only asset IDs failed to resolve: load without the manifest so every CHK check still runs on the real content.
        // The CHK-CORE-03 errors from that run are the same resolution issues, already reported once below.
        const content = loadContent(undefined, files), split = splitKnownMissing(error.issues, manifest, a, known);
        const findings = runContentChecks(content, manifest, a).filter(f => !(f.level === 'error' && f.ids[0] === 'CHK-CORE-03'));
        return { content, report: buildReport([...findings, ...split.warnings], split.errors, checks, fileCount, a.strict) };
    }
}
export const zodText = (i: { file: string; path: string; message: string }) => `ERROR    ZOD  ${i.file}:${i.path}  ${i.message}`;
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
