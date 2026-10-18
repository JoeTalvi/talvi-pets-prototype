import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AssetEntry, AssetManifest } from '../src/content/schema/assets';
import { assetPath, flags, readJson } from './assets/common';
import { dimensions } from './assets/image';
function snapshot(e: AssetEntry) {
    const { hash, status, origin, source, recordedAt, recordedBy, note } = e;
    return { hash, status, origin, source, recordedAt, recordedBy, ...(note ? { note } : {}) };
}
function required(opts: Record<string, string | boolean>, key: string): string {
    if (typeof opts[key] !== 'string' || !opts[key])
        throw new Error(`--${key} is required`);
    return String(opts[key]);
}
function prepareRow(opts: Record<string, string | boolean>, old: AssetEntry | undefined): {
    row: AssetEntry;
    data: Buffer[];
    urls: string[];
} {
    const from = required(opts, 'from').split(','), data = from.map(f => readFileSync(f));
    const metadata = opts.row ? readJson(String(opts.row)) as Record<string, unknown> : {};
    const id = required(opts, 'id'), type = String(opts.type ?? metadata.type ?? old?.type ?? 'image');
    const contract: Record<string, unknown> = { ...old };
    for (const key of ['generator', 'seed', 'prompt', 'refs', 'postProcess', 'batch', 'note'])
        delete contract[key];
    const row: Record<string, unknown> = { ...contract, ...metadata, id, type, origin: required(opts, 'origin'), source: required(opts, 'source'), recordedBy: required(opts, 'recorded-by'), recordedAt: required(opts, 'date'), history: old ? [...old.history, snapshot(old)] : [] };
    row.status = opts.status ?? (row.origin === 'production' ? 'production-reference' : 'ai-placeholder');
    if (row.status === 'accepted')
        throw new Error('Only a human may record accepted status; this tool cannot');
    delete row.acceptedBy;
    delete row.acceptedAt;
    delete row.acceptedReason;
    if (opts.generator)
        row.generator = opts.generator;
    if (opts.note)
        row.note = opts.note;
    const urls = old ? (old.urls ?? [old.url!]) : type === 'audio' ? from.map(f => id + extname(f)) : [String(opts.url ?? metadata.url ?? (id + extname(from[0])))];
    if (data.length !== urls.length)
        throw new Error('Source count must equal destination URL count');
    if (from.some((f, i) => extname(f).toLowerCase() !== extname(urls[i]).toLowerCase()))
        throw new Error('Replacement must retain file format');
    if (type === 'audio') {
        row.urls = urls;
        delete row.url;
    }
    else
        row.url = urls[0];
    if (type === 'image' || type === 'spritesheet')
        row.px = dimensions(data[0]);
    row.hash = createHash('sha256').update(data[0]).digest('hex');
    const parsed = AssetEntry.parse(row);
    if (old && ['type', 'px', 'frame', 'clips', 'html', 'family', 'weight', 'url', 'urls'].some(k => JSON.stringify(parsed[k as keyof AssetEntry]) !== JSON.stringify(old[k as keyof AssetEntry])))
        throw new Error('Replacement must retain type, dimensions, frame, clips, HTML/font semantics and URLs');
    return { row: parsed, data, urls };
}
/** Stage all bytes first; handled write failures restore the original bytes. Process-kill recovery uses Git. */
function publish(writes: {
    path: string;
    data: Buffer | string;
}[]) {
    const backups = writes.map(w => ({ path: w.path, data: existsSync(w.path) ? readFileSync(w.path) : undefined })), staged: string[] = [];
    try {
        for (const w of writes) {
            mkdirSync(dirname(w.path), { recursive: true });
            const temp = w.path + `.ledger-${process.pid}.tmp`;
            writeFileSync(temp, w.data, { flag: 'wx' });
            staged.push(temp);
        }
        writes.forEach((w, i) => renameSync(staged[i], w.path));
    }
    catch (error) {
        for (const b of backups) {
            if (b.data)
                writeFileSync(b.path, b.data);
            else
                rmSync(b.path, { force: true });
        }
        throw error;
    }
    finally {
        for (const p of staged)
            rmSync(p, { force: true });
    }
}
export function main(args: string[]): number {
    const [verb, ...rest] = args;
    if (!['append', 'replace', 'retire'].includes(verb))
        throw new Error('Usage: asset-ledger append|replace|retire --manifest file --id family/name ...');
    const opts = flags(rest, ['manifest', 'id', 'from', 'type', 'origin', 'source', 'recorded-by', 'date', 'status', 'generator', 'note', 'row', 'url', 'format', 'out'], ['dry-run']);
    const manifestFile = resolve(String(opts.manifest ?? 'public/assets/manifest.json')), root = dirname(manifestFile), m = AssetManifest.parse(readJson(manifestFile));
    const id = required(opts, 'id'), index = m.entries.findIndex(e => e.id === id), old = m.entries[index];
    if (verb === 'append' && old)
        throw new Error('AssetId already exists; use replace');
    if (verb !== 'append' && !old)
        throw new Error('Unknown AssetId');
    if (old?.status === 'accepted')
        throw new Error('Human-accepted rows cannot be changed by this tool');
    let writes: {
        path: string;
        data: Buffer | string;
    }[] = [];
    if (verb === 'retire')
        m.entries[index] = { ...old, retired: true, history: [...old.history, snapshot(old)], recordedBy: required(opts, 'recorded-by'), recordedAt: required(opts, 'date'), note: required(opts, 'note') };
    else {
        const result = prepareRow(opts, old);
        if (old)
            m.entries[index] = result.row;
        else
            m.entries.push(result.row);
        writes = result.urls.map((url, i) => ({ path: assetPath(root, url), data: result.data[i] }));
        if (!old && writes.some(w => existsSync(w.path)))
            throw new Error('Append would overwrite an existing file; choose a new AssetId');
    }
    AssetManifest.parse(m);
    writes.push({ path: manifestFile, data: JSON.stringify(m, null, 2) + '\n' });
    if (!opts['dry-run'])
        publish(writes);
    const output = JSON.stringify({ ok: true, verb, id, dryRun: !!opts['dry-run'], entry: m.entries.find(e => e.id === id) }, null, 2) + '\n';
    if (opts.out)
        writeFileSync(String(opts.out), output);
    else
        process.stdout.write(output);
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = main(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`asset-ledger: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 3;
    }
}
