import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AssetEntry, AssetManifest } from '../src/content/schema/assets';
import { assetPath, flags, readJson } from './assets/common';
import { dimensions } from './assets/image';
import { derivedIssue } from './assets/checks';
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
        throw new Error('append/replace cannot record accepted status; use `accept` with a human approval record (DEC-040)');
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
    // --layout-change (a contract amendment such as CN-12's 6×7 pet sheet) lets dimensions and clips change; everything else stays.
    const retained = ['type', 'px', 'frame', 'clips', 'html', 'family', 'weight', 'url', 'urls'].filter(k => !(opts['layout-change'] && (k === 'px' || k === 'clips')));
    if (old && retained.some(k => JSON.stringify(parsed[k as keyof AssetEntry]) !== JSON.stringify(old[k as keyof AssetEntry])))
        throw new Error(`Replacement must retain ${opts['layout-change'] ? 'type, frame' : 'type, dimensions, frame, clips'}, HTML/font semantics and URLs${opts['layout-change'] ? '' : ' (use --layout-change for an amended sheet layout)'}`);
    if (opts['layout-change'] && !old)
        throw new Error('--layout-change applies to replace only');
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
type Writes = { path: string; data: Buffer | string }[];
type Opts = Record<string, string | boolean>;
const APPROVALS = 'phase-3-preproduction/approvals';
/** Local calendar date (YYYY-MM-DD); the ledger's dates are the user's day, not UTC. */
function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** The approval record, as a workflow-root relative path; the workflow root is three levels above game/public/assets/manifest.json. */
function approvalRecord(opts: Opts, manifestFile: string): string {
    const project = resolve(dirname(manifestFile), '../../..'), file = resolve(project, required(opts, 'record'));
    const rel = relative(resolve(project, APPROVALS), file);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
        throw new Error(`--record must name a file under ${APPROVALS}/ in the workflow root ${project}`);
    if (!existsSync(file) || !statSync(file).isFile())
        throw new Error(`--record ${relative(project, file)} does not exist`);
    return relative(project, file).split(sep).join('/');
}
/** DEC-040: a human-instructed acceptance; previous provenance goes onto history[] so the ledger only grows. */
function acceptRow(old: AssetEntry, opts: Opts, manifestFile: string): AssetEntry {
    if (old.status === 'accepted')
        throw new Error(`${old.id} is already accepted`);
    if (old.retired)
        throw new Error(`${old.id} is retired; accept a live row`);
    const acceptedBy = required(opts, 'by'), reason = required(opts, 'reason'), record = approvalRecord(opts, manifestFile);
    return AssetEntry.parse({ ...old, status: 'accepted', acceptedBy, acceptedAt: String(opts.date ?? today()), acceptedReason: `${reason} Record: ${record}`, history: [...old.history, snapshot(old)] });
}
/** Applies one verb to the manifest in memory and returns the asset byte writes it needs. */
function applyVerb(verb: string, m: AssetManifest, id: string, opts: Opts, manifestFile: string): Writes {
    const index = m.entries.findIndex(e => e.id === id), old = m.entries[index], root = dirname(manifestFile);
    if (verb === 'append' && old)
        throw new Error('AssetId already exists; use replace');
    if (verb !== 'append' && !old)
        throw new Error('Unknown AssetId');
    // An accepted row may only be replaced, which demotes it (new bytes are not yet accepted; history keeps the accepted snapshot).
    if (old?.status === 'accepted' && verb === 'retire')
        throw new Error('Human-accepted rows cannot be retired by this tool');
    if (verb === 'accept') {
        m.entries[index] = acceptRow(old, opts, manifestFile);
        return [];
    }
    if (verb === 'retire') {
        m.entries[index] = { ...old, retired: true, history: [...old.history, snapshot(old)], recordedBy: required(opts, 'recorded-by'), recordedAt: required(opts, 'date'), note: required(opts, 'note') };
        return [];
    }
    const result = prepareRow(opts, old);
    if (old)
        m.entries[index] = result.row;
    else
        m.entries.push(result.row);
    const writes = result.urls.map((url, i) => ({ path: assetPath(root, url), data: result.data[i] }));
    if (!old && writes.some(w => existsSync(w.path)))
        throw new Error('Append would overwrite an existing file; choose a new AssetId');
    return writes;
}
export function main(args: string[]): number {
    const [verb, ...rest] = args;
    if (!['append', 'replace', 'retire', 'accept'].includes(verb))
        throw new Error('Usage: asset-ledger append|replace|retire|accept --manifest file --id family/name ... (accept: --by name --reason text --record phase-3-preproduction/approvals/<file>)');
    const opts = flags(rest, ['manifest', 'id', 'from', 'type', 'origin', 'source', 'recorded-by', 'date', 'status', 'generator', 'note', 'row', 'url', 'format', 'out', 'by', 'reason', 'record'], ['dry-run', 'layout-change']);
    const manifestFile = resolve(String(opts.manifest ?? 'public/assets/manifest.json')), m = AssetManifest.parse(readJson(manifestFile));
    const id = required(opts, 'id'), writes = applyVerb(verb, m, id, opts, manifestFile);
    AssetManifest.parse(m);
    const derived = derivedIssue(m.entries.find(e => e.id === id)!, m);
    if (derived?.level === 'error')
        throw new Error(`VERIFY-ASSET-007: ${derived.message}; a derived row's --source must be an existing runtime AssetId (or record a non-derived origin for an external file)`);
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
