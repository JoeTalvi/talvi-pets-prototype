// WORK-026-2 (RUN-003): deterministic synthesized SFX placeholders for ASSET-018.
// Renders each config entry to 44.1 kHz mono 16-bit WAV (sine partials, exponential decay,
// no leading silence), then encodes M4A (afconvert AAC 96k) and OGG (route A: ffmpeg's
// experimental vorbis encoder; route B: libsndfile via tools/assets/sfx-ogg-sndfile.py),
// validating every encoded file by a decode round-trip against the ASSET-018 limits.
// Usage: node tools/assets/sfx-placeholders.mjs --config <json> --out <dir> [--encode-only-wav]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FFMPEG = '/opt/homebrew/bin/ffmpeg', FFPROBE = '/opt/homebrew/bin/ffprobe', MAX_BYTES = 40000, MAX_PEAK_DB = -3;
const here = dirname(fileURLToPath(import.meta.url));

function args(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++)
        if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i];
    if (!out.config || !out.out) throw new Error('Usage: sfx-placeholders.mjs --config <json> --out <dir>');
    return out;
}

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

// One partial: phase is integrated sample by sample so a linear pitch glide stays continuous.
function addPartial(buf, start, p, rate, attack) {
    let phase = 0;
    const glide = Math.max(1, Math.round((p.glideMs ?? 0) * rate / 1000));
    for (let i = 0; start + i < buf.length; i++) {
        const t = i / rate, f = p.glideTo === undefined ? p.freq : p.freq + (p.glideTo - p.freq) * Math.min(1, i / glide);
        const env = p.amp * Math.exp(-p.decay * t) * Math.min(1, (i + 1) / attack);
        buf[start + i] += env * Math.sin(phase);
        phase += 2 * Math.PI * f / rate;
    }
}

function render(entry, cfg) {
    const rate = cfg.sampleRate, n = Math.round(entry.lengthMs * rate / 1000), buf = new Float64Array(n);
    const attack = Math.round(cfg.attackMs * rate / 1000), fade = Math.round(cfg.fadeOutMs * rate / 1000);
    for (const seg of entry.segments)
        for (const p of seg.partials) addPartial(buf, Math.round(seg.startMs * rate / 1000), p, rate, attack);
    for (let i = 0; i < fade; i++) buf[n - 1 - i] *= i / fade;
    const max = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0), target = 10 ** (entry.peakDbfs / 20) * 32767 / max;
    const pcm = Int16Array.from(buf, v => Math.round(v * target));
    return { pcm, rate, attackSamples: attack, firstEnvelope: 1 / attack, firstNonZero: pcm.findIndex(v => v !== 0) };
}

function wav(pcm, rate) {
    const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
    h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

export function measure(file, codec, limitMs) {
    const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
    const s = probe.streams.find(x => x.codec_type === 'audio') ?? {};
    const decoded = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'], { maxBuffer: 16 * 1024 * 1024 });
    let peak = 0;
    for (let i = 0; i < decoded.length; i += 4) peak = Math.max(peak, Math.abs(decoded.readFloatLE(i)));
    const m = { codec: s.codec_name, channels: s.channels, sampleRate: Number(s.sample_rate), bitRate: Number(s.bit_rate ?? probe.format.bit_rate),
        durationMs: Number(probe.format.duration) * 1000, peakDb: 20 * Math.log10(peak), bytes: statSync(file).size, sha256: sha256(readFileSync(file)) };
    m.problems = [m.codec !== codec && `codec ${m.codec}`, m.channels !== 1 && `channels ${m.channels}`, m.sampleRate !== 44100 && `rate ${m.sampleRate}`,
        m.durationMs > limitMs && `duration ${m.durationMs}`, m.peakDb > MAX_PEAK_DB && `peak ${m.peakDb}`, m.bytes > MAX_BYTES && `bytes ${m.bytes}`].filter(Boolean);
    return m;
}

function encodeOgg(wavFile, ogg, limitMs) {
    const attempts = [];
    try {
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', wavFile, '-ac', '1', '-ar', '44100', '-c:a', 'vorbis', '-strict', '-2', ogg]);
        const m = measure(ogg, 'vorbis', limitMs);
        if (!m.problems.length) return { route: 'A ffmpeg vorbis -strict -2', measured: m, attempts };
        attempts.push({ route: 'A', problems: m.problems });
    } catch (err) { attempts.push({ route: 'A', error: String(err.stderr ?? err.message).trim() }); }
    execFileSync('python3', ['-I', join(here, 'sfx-ogg-sndfile.py'), wavFile, ogg]);
    const m = measure(ogg, 'vorbis', limitMs);
    if (m.problems.length) throw new Error(`OGG routes A and B both failed for ${ogg}: ${JSON.stringify([...attempts, { route: 'B', problems: m.problems }])}`);
    return { route: 'B libsndfile Vorbis (tools/assets/sfx-ogg-sndfile.py)', measured: m, attempts };
}

function main() {
    const opts = args(process.argv.slice(2)), cfgPath = resolve(opts.config), cfg = JSON.parse(readFileSync(cfgPath, 'utf8')), out = resolve(opts.out);
    mkdirSync(out, { recursive: true });
    const report = { script: { path: 'tools/assets/sfx-placeholders.mjs', sha256: sha256(readFileSync(fileURLToPath(import.meta.url))) },
        config: { path: opts.config, sha256: sha256(readFileSync(cfgPath)) }, entries: [] };
    for (const entry of cfg.entries) {
        const r = render(entry, cfg), bytes = wav(r.pcm, r.rate), wavFile = join(out, `${entry.name}.wav`);
        writeFileSync(wavFile, bytes);
        const peakDb = 20 * Math.log10(r.pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0) / 32768);
        const row = { id: entry.id, wav: { sha256: sha256(bytes), samples: r.pcm.length, lengthMs: r.pcm.length * 1000 / r.rate, peakDb,
            attackSamples: r.attackSamples, envelopeAtSample0: r.firstEnvelope, firstNonZeroSample: r.firstNonZero, lastSample: r.pcm[r.pcm.length - 1] } };
        if (!opts['encode-only-wav']) {
            const m4a = join(out, `${entry.name}.m4a`), ogg = join(out, `${entry.name}.ogg`);
            execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-c', '1', wavFile, m4a]);
            row.m4a = { route: 'afconvert -f m4af -d aac -b 96000 -c 1', measured: measure(m4a, 'aac', entry.limitMs) };
            if (row.m4a.measured.problems.length) throw new Error(`M4A failed for ${entry.id}: ${row.m4a.measured.problems}`);
            row.ogg = encodeOgg(wavFile, ogg, entry.limitMs);
        }
        report.entries.push(row);
    }
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.entries.map(e => ({ id: e.id, wav: e.wav.sha256.slice(0, 12), ogg: e.ogg?.route, m4aMs: e.m4a?.measured.durationMs, oggMs: e.ogg?.measured.durationMs }))));
}

main();
