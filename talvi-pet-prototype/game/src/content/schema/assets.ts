import { z } from 'zod';
export const AssetId = z.string().regex(/^(fonts|ui|world|houses|rooms|charms|pets|player|clues|sfx)\/[A-Za-z0-9][A-Za-z0-9_-]*$/);
const Px = z.object({ w: z.number().int().positive().max(2048), h: z.number().int().positive().max(2048) });
// CN-07 / assets.md "ASSET-014 explicit per-frame clip timing": optional per-frame ms durations override frameRate for that clip.
export function frameDurationIssue(clip: { start: number; end: number; frameDurationsMs?: number[] }): string | undefined {
    const d = clip.frameDurationsMs;
    if (d === undefined)
        return undefined;
    if (d.length !== clip.end - clip.start + 1)
        return `frameDurationsMs length ${d.length} must equal end − start + 1 (${clip.end - clip.start + 1})`;
    if (d.some(ms => !Number.isInteger(ms) || ms <= 0))
        return 'frameDurationsMs values must be positive integers';
    return undefined;
}
const Clip = z.object({ start: z.number().int().min(0), end: z.number().int().min(0), frameRate: z.number().positive(), repeat: z.number().int().min(-1), frameDurationsMs: z.array(z.number()).optional() })
    .superRefine((c, ctx) => { const issue = frameDurationIssue(c); if (issue) ctx.addIssue({ code: 'custom', path: ['frameDurationsMs'], message: issue }); });
const HistoryRow = z.object({ hash: z.string().length(64), status: z.enum(['ai-placeholder', 'production-reference', 'accepted']),
    origin: z.enum(['asset-bot', 'production', 'authored', 'derived', 'cc0']), source: z.string(), recordedAt: z.string().date(), recordedBy: z.string(), note: z.string().optional() });
export const AssetEntry = z.object({
    id: AssetId,
    type: z.enum(['image', 'spritesheet', 'audio', 'font']),
    url: z.string().optional(), // image | spritesheet | font (relative to assets/)
    urls: z.array(z.string()).min(1).optional(), // audio: [m4a, ogg] in loader order
    html: z.boolean().optional(), // true = HTML-only (SVG); the Phaser loader skips it
    px: Px.optional(), // image | spritesheet: exact file dimensions
    frame: Px.optional(), // spritesheet
    clips: z.record(z.string(), Clip).optional(), // spritesheet
    family: z.string().optional(), weight: z.string().optional(), // font: CSS family, weight range
    durationMs: z.number().int().positive().optional(), // audio
    // ledger (EVD-018; mirrors production docs/ai-assets/manifest.json: status, source, batch, recordedAt, note, acceptedReason)
    status: z.enum(['ai-placeholder', 'production-reference', 'accepted']),
    origin: z.enum(['asset-bot', 'production', 'authored', 'derived', 'cc0']),
    source: z.string(), // production path (+ atlas rect / transform), asset-bot run candidate path, repo path, or the AssetId it derives from
    generator: z.string().optional(), // 'asset-bot/generate_image:nano-banana' | ':gpt-image' | 'asset-bot/generate_audio' | 'svg-authored' | 'sips' | 'ffmpeg' | …
    seed: z.number().int().optional(), prompt: z.string().optional(), refs: z.array(z.string()).optional(), postProcess: z.string().optional(),
    batch: z.string().optional(), // generation batch name (production field)
    hash: z.string().length(64), // sha256 of the file (audio: of the m4a)
    recordedAt: z.string().date(), recordedBy: z.string(),
    acceptedBy: z.string().optional(), acceptedAt: z.string().date().optional(), acceptedReason: z.string().optional(),
    retired: z.boolean().optional(), // no longer referenced; the row stays (ledger only grows)
    history: z.array(HistoryRow).default([]), // every previous file under this id, oldest first
    note: z.string().optional(),
}).superRefine((e, ctx) => {
    if ((e.type === 'audio') !== Array.isArray(e.urls))
        ctx.addIssue({ code: 'custom', message: 'audio uses urls[], others url' });
    if (e.type !== 'audio' && !e.url)
        ctx.addIssue({ code: 'custom', message: 'url required' });
    if ((e.type === 'image' || e.type === 'spritesheet') && !e.px && !e.html)
        ctx.addIssue({ code: 'custom', message: 'px required' });
    if (e.type === 'spritesheet' && (!e.frame || !e.clips))
        ctx.addIssue({ code: 'custom', message: 'frame and clips required' });
    if (e.type === 'font' && (!e.family || !e.weight))
        ctx.addIssue({ code: 'custom', message: 'family and weight required' });
    if (e.status === 'accepted' && !(e.acceptedBy && e.acceptedAt && e.acceptedReason))
        ctx.addIssue({ code: 'custom', message: 'accepted needs acceptedBy/acceptedAt/acceptedReason' });
    if (e.status === 'ai-placeholder' && e.origin === 'asset-bot' && !e.generator)
        ctx.addIssue({ code: 'custom', message: 'generator required' });
    if (e.origin === 'production' && e.status === 'ai-placeholder')
        ctx.addIssue({ code: 'custom', message: 'production copies are production-reference' });
});
export const AssetManifest = z.object({
    schemaVersion: z.literal(1),
    purpose: z.string(),
    entries: z.array(AssetEntry),
}).superRefine((m, ctx) => { const ids = m.entries.map(e => e.id); if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: 'custom', message: 'duplicate AssetId' }); });
export type AssetId = z.infer<typeof AssetId>;
export type AssetEntry = z.infer<typeof AssetEntry>;
export type AssetManifest = z.infer<typeof AssetManifest>;
export type Clip = z.infer<typeof Clip>;
