import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AssetManifest, type AssetEntry } from '../../src/content/schema/assets';
import { assetPath, files, readJson, type Finding } from './common';
import { dimensions, decodePng, bounds, alphaIoU, type Raster } from './image';
export type Add = (id: string, level: Finding['level'], path: string, message: string, details?: Record<string, unknown>, file?: string) => void;
export function checkClips(e: AssetEntry): string[] {
    if (e.type !== 'spritesheet' || !e.frame || !e.px)
        return [];
    const count = e.px.w / e.frame.w * e.px.h / e.frame.h, issues: string[] = [];
    if (e.px.w % e.frame.w || e.px.h % e.frame.h)
        issues.push('Sheet dimensions must be divisible by frame');
    for (const [name, c] of Object.entries(e.clips ?? {}))
        if (c.start > c.end || c.end >= count)
            issues.push(`Clip ${name} indices outside ${count} frames`);
    if (e.id === 'world/dust-poof' && (count !== 9 || e.frame.w !== 320 || e.frame.h !== 320 || JSON.stringify(e.clips?.dust) !== JSON.stringify({ start: 0, end: 8, frameRate: 18, repeat: 0 })))
        issues.push('Dust requires nine 320×320 frames, clip 0–8 at 18 fps repeat 0');
    return issues;
}
const ui: Record<string, [
    number,
    number
]> = { Panel_PopupHero: [952, 692], Panel_ModalDialog: [832, 492], Panel_BottomSheet: [1132, 812], Panel_InsetSubPanel: [772, 292], Panel_ListRow: [992, 212], Panel_GridTile: [272, 272], Panel_ToastPill: [672, 162], Panel_TooltipBubble: [612, 326], Btn_RoundIcon: [218, 218], Bar_ChunkBackground_No_Fill: [130, 280], Bar_ChunkFill: [130, 280], Joystick_Base: [328, 328], Joystick_Handle: [178, 178], Toggle_Checkbox_On: [192, 192], Toggle_Checkbox_Off: [192, 192], Switch_Track: [672, 172], Switch_Knob: [344, 144] };
export function expectedSize(e: AssetEntry): [
    number,
    number
] | undefined {
    const [family, name] = e.id.split('/');
    if (ui[name])
        return ui[name];
    if (/^Btn_(Primary|Secondary)_/.test(name))
        return [532, 182];
    if (name.startsWith('Btn_Tab_'))
        return [392, 162];
    if (name.startsWith('tile-grass-'))
        return [320, 213];
    if (name.startsWith('tag-'))
        return [96, 96];
    if (family === 'clues')
        return [256, 256];
    if (family === 'rooms')
        return [1920, 1080];
    if (family === 'pets' && /portrait|silhouette/.test(name))
        return [600, 600];
    if (e.id === 'ui/game-portrait')
        return [400, 400];
    if (e.id === 'world/dust-poof')
        return [960, 960];
    return undefined;
}
// These exact source-preserving exports have reviewed geometry exceptions (WORK-012).
const housePivotExceptions: Record<string, string> = {
    "houses/pet-house-lv1": "4a14dc661cc2dd681fe633be7f55f09b781490c718c9f5fd7bbc6ceb2b076794",
    "houses/pet-house-lv2": "faf8563b0a7675d3381aac19cea793e40cd75dcccefca5adc67d4c7d3e1e0492",
    "houses/pet-house-lv3": "d46d9aa8bc2b9397447161384e8cf93b4d553914f5c0989220c60e1d6c552bba",
    "houses/pet-house-lv4": "47ddffa628b788d4c0e4b79e4e9a922ec06466f7060c720e52273ed02d2946ec",
    "houses/pet-house-lv5": "dd6ff458e22752303d2ff9a4ca1295fe574af48f415017a8f9fd4b4e9dd0d89f",
    "houses/pet-house-lv6": "00bbe3d01479e2363988830cfeba292d2cacbacdd73bf464cf932d9b6bf500ec",
    "houses/starter-house-complete": "3759b1750a0fe9351dbd3b3ea825b158bba939fd59e2ddebb56c72652fb24fb0"
};
function pivot(e: AssetEntry, r: Raster, add: Add, path: string) {
    if (!/^(charms|houses|pets|player)\//.test(e.id) && !/^world\/(bush|rock|flower)-/.test(e.id))
        return;
    if (/portrait|silhouette/.test(e.id))
        return;
    const w = e.frame?.w ?? r.w, h = e.frame?.h ?? r.h;
    for (let y = 0; y < r.h; y += h)
        for (let x = 0; x < r.w; x += w) {
            const box = bounds(r, x, y, w, h);
            if (box.bottomGap > 2 || box.centerOffset > 6)
                add('004', e.origin === 'production' && housePivotExceptions[e.id] === e.hash ? 'warning' : 'error', path, `${e.id}: base-centre mismatch; production/stopgap art retained for review`, { frame: { x, y, w, h }, ...box });
        }
}
function imageCheck(e: AssetEntry, b: Buffer, add: Add, path: string): Raster | undefined {
    const px = dimensions(b), expected = expectedSize(e);
    if (px.w !== e.px?.w || px.h !== e.px?.h || px.w > 2048 || px.h > 2048)
        add('002', 'error', path, `${e.id}: measured dimensions differ from px or exceed 2048`, { actual: px, declared: e.px });
    if (expected && (px.w !== expected[0] || px.h !== expected[1]))
        add('002', 'error', path, `${e.id}: family canvas must be ${expected.join('×')}`, { actual: px });
    if (e.id.startsWith('houses/') && Math.max(px.w, px.h) !== 800)
        add('002', 'error', path, `${e.id}: house longest side must be 800`);
    if (/^world\/(bush|rock|flower)-/.test(e.id) && Math.max(px.w, px.h) !== 320)
        add('002', 'error', path, `${e.id}: prop longest side must be 320`);
    for (const message of checkClips(e))
        add('005', 'error', path, message);
    if (extname(e.url ?? '').toLowerCase() !== '.png')
        return;
    const r = decodePng(b), corners = [r.alpha[0], r.alpha[r.w - 1], r.alpha[(r.h - 1) * r.w], r.alpha[r.w * r.h - 1]];
    if (!e.id.startsWith('rooms/') && (!r.hasAlpha || corners.some(a => a !== 0)))
        add('003', 'error', path, `${e.id}: overlay alpha/corners mismatch; source retained for review`, { hasAlpha: r.hasAlpha, corners });
    pivot(e, r, add, path);
    return r;
}
function audioCheck(e: AssetEntry, root: string, add: Add, path: string) {
    if (e.urls?.length !== 2 || !e.urls[0].endsWith('.m4a') || !e.urls[1].endsWith('.ogg'))
        add('006', 'error', path, 'Audio requires [m4a, ogg] in that order');
    const limits: Record<string, number> = { place: 300, heart: 1000, complete: 2000, reaction: 400, 'phase-pop': 500 };
    for (const url of e.urls ?? []) {
        const file = assetPath(root, url), probe = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
        const stream = probe.streams.find((s: {
            codec_type: string;
        }) => s.codec_type === 'audio'), duration = Number(probe.format.duration) * 1000, limit = limits[e.id.split('/')[1]] ?? 2000;
        const decoded = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'], { maxBuffer: 10 * 1024 * 1024 });
        let peak = 0;
        for (let i = 0; i < decoded.length; i += 4)
            peak = Math.max(peak, Math.abs(decoded.readFloatLE(i)));
        const peakDb = 20 * Math.log10(peak);
        add('006', stream?.channels !== 1 || Number(stream?.sample_rate) !== 44100 || duration > limit || peakDb > -3 || statSync(file).size > 40000 || (e.durationMs ?? 0) > limit ? 'error' : 'info', path, `${url}: measured audio`, { channels: stream?.channels, sampleRate: Number(stream?.sample_rate), durationMs: duration, limitMs: limit, peakDb });
    }
}
export function checkLedger(current: AssetManifest, previous: AssetManifest, add: Add) {
    for (const old of previous.entries) {
        const now = current.entries.find(e => e.id === old.id), path = '/entries/' + previous.entries.indexOf(old);
        if (!now) {
            add('007', 'error', path, 'Ledger id removed');
            continue;
        }
        if (now.history.length < old.history.length || old.history.some((h, i) => JSON.stringify(now.history[i]) !== JSON.stringify(h)))
            add('007', 'error', path, 'Historical rows removed or rewritten');
        if (old.hash !== now.hash) {
            const snapshot = now.history[old.history.length];
            if (!snapshot || ['hash', 'status', 'origin', 'source', 'recordedAt', 'recordedBy'].some(k => snapshot[k as keyof typeof snapshot] !== old[k as keyof AssetEntry]))
                add('007', 'error', path, 'Replacement must append the previous provenance snapshot');
        }
        if (old.status === 'accepted' && JSON.stringify(old) !== JSON.stringify(now))
            add('007', 'error', path, 'Human-accepted row changed; requires separate human review');
    }
}
export function gitBaseline(manifestFile: string): AssetManifest | undefined {
    const cwd = dirname(manifestFile), root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim(), path = relative(root, resolve(manifestFile)).split('\\').join('/');
    const present = execFileSync('git', ['ls-tree', 'HEAD', '--', path], { cwd: root, encoding: 'utf8' }).trim();
    if (!present)
        return;
    return AssetManifest.parse(JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' })));
}
function derivedChecks(m: AssetManifest, add: Add) {
    for (const e of m.entries.filter(e => e.origin === 'derived')) {
        const parent = m.entries.find(p => p.id === e.source);
        if (!parent) {
            add('007', e.recordedBy === 'TASK-022 / WORK-001' ? 'warning' : 'error', '/entries/' + m.entries.indexOf(e), 'Derived source is an external path; no runtime parent status to compare');
            continue;
        }
        if (e.status !== parent.status)
            add('007', 'error', '/entries/' + e.id, 'Derived creative status must inherit parent status');
    }
}
export function checkAssetFiles(m: AssetManifest, root: string, add: Add) {
    const rasters = new Map<string, Raster>();
    let bytes = 0;
    for (const [i, e] of m.entries.entries()) {
        const path = `/entries/${i}`, urls = e.urls ?? [e.url!];
        let valid = true;
        for (const url of urls) {
            const p = assetPath(root, url);
            if (!existsSync(p)) {
                add('001', 'error', path, `Missing file ${url}`);
                valid = false;
            }
        }
        if (!valid)
            continue;
        const b = readFileSync(assetPath(root, urls[0]));
        if (createHash('sha256').update(b).digest('hex') !== e.hash)
            add('007', 'error', path, `${e.id}: hash does not match file`);
        if ((e.type === 'image' || e.type === 'spritesheet') && !e.html) {
            const r = imageCheck(e, b, add, path);
            if (r)
                rasters.set(e.id, r);
        }
        if (e.type === 'audio')
            audioCheck(e, root, add, path);
    }
    const a = rasters.get('pets/owl-portrait'), b = rasters.get('pets/owl-silhouette');
    if (a && b && alphaIoU(a, b) < 0.98)
        add('003', 'error', '/entries', 'Owl silhouette alpha IoU below 0.98', { iou: alphaIoU(a, b) });
    for (const file of files(root)) {
        const size = statSync(file).size;
        bytes += size;
        if (size > 2000000)
            add('009', 'error', '', `${relative(root, file)} exceeds 2 MB`, { bytes: size });
    }
    const kib = Number(execFileSync('du', ['-sk', root], { encoding: 'utf8' }).split(/\s+/)[0]);
    add('009', bytes > 20000000 || kib * 1024 > 20000000 ? 'error' : 'info', '', 'Asset payload measured', { bytes, allocatedKiB: kib, fileCount: files(root).length });
    derivedChecks(m, add);
}
export function contentChecks(m: AssetManifest, contentDir: string, add: Add) {
    const referenced = new Set<string>(), ids = new Map(m.entries.map(e => [e.id, e]));
    if (!existsSync(contentDir)) {
        add('001', 'info', '', 'Content directory unavailable; isolated pipeline check');
        return;
    }
    const json = files(contentDir).filter(p => p.endsWith('.json'));
    function visit(value: unknown, path: string, file: string) {
        if (Array.isArray(value)) {
            value.forEach((v, i) => visit(v, path + '/' + i, file));
            return;
        }
        if (value && typeof value === 'object')
            for (const [k, v] of Object.entries(value))
                visit(v, path + '/' + k, file);
        if (typeof value === 'string' && /^(fonts|ui|world|houses|rooms|charms|pets|player|clues|sfx)\//.test(value)) {
            referenced.add(value);
            if (!ids.has(value) || ids.get(value)?.retired)
                add('001', 'error', path, `Unresolved or retired AssetId ${value}`, undefined, file);
        }
    }
    for (const file of json)
        visit(readJson(file), '', file);
    const charms = resolve(contentDir, 'charms.json');
    if (existsSync(charms)) {
        const data = readJson(charms) as {
            types?: {
                sprite: string;
                sizeClass: string;
            }[];
        };
        const sizes: Record<string, [
            number,
            number
        ]> = { small: [160, 192], large: [320, 256], wall: [128, 128] };
        for (const t of data.types ?? []) {
            const e = ids.get(t.sprite), size = sizes[t.sizeClass];
            if (e?.px && size && (e.px.w !== size[0] || e.px.h !== size[1]))
                add('002', 'error', 'charms.json', `${t.sprite}: canvas differs from sizeClass ${t.sizeClass}`);
        }
    }
    for (const e of m.entries)
        if (!e.retired && !referenced.has(e.id) && !ui[e.id.split('/')[1]] && !/^ui\/Btn_(Primary|Secondary|Tab)_/.test(e.id) && !['ui/game-portrait', 'ui/mystery-shape'].includes(e.id) && !['font', 'audio'].includes(e.type) && e.id !== 'world/dust-poof' && e.id !== 'player/avatar-sheet')
            add('001', 'warning', '/entries/' + m.entries.indexOf(e), 'Asset unreferenced by available content/presentation table');
    if (!json.length)
        add('001', 'info', '', 'No content JSON yet; reference checks deferred to combined FX-CONTENT-MIN run');
}
