import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AssetManifest } from '../src/content/schema/assets';
import { flags, readJson, readKnownMissing, report, resolvedKnownMissing, type Finding } from './assets/common';
import { checkAssetFiles, checkLedger, contentChecks, gitBaseline, type Add } from './assets/checks';
export function main(args: string[]): number {
    const opts = flags(args, ['format', 'out', 'content', 'manifest', 'baseline', 'seed', 'known-missing'], ['strict', 'no-git']);
    const file = String(opts.manifest ?? 'public/assets/manifest.json'), findings: Finding[] = [];
    const add: Add = (id, level, path, message, details, findingFile) => findings.push({ ids: [`VERIFY-ASSET-${id}`], level, file: findingFile ?? file, path, message, ...(details ? { details } : {}) });
    const known = opts['known-missing'] ? readKnownMissing(String(opts['known-missing'])) : undefined;
    const parsed = AssetManifest.safeParse(readJson(file));
    if (!parsed.success) {
        for (const i of parsed.error.issues)
            add(i.path.includes('frameDurationsMs') ? '005' : '001', 'error', '/' + i.path.join('/'), i.message);
        return report(findings, opts, 1, 1);
    }
    checkAssetFiles(parsed.data, dirname(resolve(file)), add);
    contentChecks(parsed.data, resolve(String(opts.content ?? 'src/content')), add, known && { ids: known, file: String(opts['known-missing']) });
    for (const id of known ? resolvedKnownMissing(known, parsed.data.entries.map(e => e.id)) : [])
        add('001', 'info', '', `${id} now resolves in the manifest; remove it from the known-missing list`, undefined, String(opts['known-missing']));
    const previous = opts.baseline ? AssetManifest.parse(readJson(String(opts.baseline))) : opts['no-git'] ? undefined : gitBaseline(resolve(file));
    if (previous)
        checkLedger(parsed.data, previous, add);
    else
        add('007', 'info', '', 'No committed baseline available (or explicitly disabled); ledger comparison not executed');
    return report(findings, opts, 8, parsed.data.entries.length);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = main(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`check-assets: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 3;
    }
}
