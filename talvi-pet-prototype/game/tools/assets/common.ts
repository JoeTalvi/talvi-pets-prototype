import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
export interface Finding {
    ids: string[];
    level: 'error' | 'warning' | 'info';
    file: string;
    path: string;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
}
export function readJson(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')); }
export function assetPath(root: string, url: string): string {
    const path = resolve(root, url), rel = relative(root, path);
    if (!url || url.includes('\\') || url.startsWith('/') || rel === '..' || rel.startsWith('..' + sep) || url.includes('://'))
        throw new Error(`Unsafe asset URL: ${url}`);
    return path;
}
export function files(root: string): string[] { return readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(root, e.name)) : [resolve(root, e.name)]).sort(); }
export function flags(args: string[], values: string[], switches: string[] = []): Record<string, string | boolean> {
    const result: Record<string, string | boolean> = {};
    for (let i = 0; i < args.length; i++) {
        const key = args[i].replace(/^--/, '');
        if (!args[i].startsWith('--') || (!values.includes(key) && !switches.includes(key)))
            throw new Error(`Unknown flag ${args[i]}`);
        if (switches.includes(key))
            result[key] = true;
        else {
            if (!args[i + 1] || args[i + 1].startsWith('--'))
                throw new Error(`Missing value for ${args[i]}`);
            result[key] = args[++i];
        }
    }
    if (result.format && !['text', 'json'].includes(String(result.format)))
        throw new Error('format must be text or json');
    return result;
}
export function report(findings: Finding[], opts: Record<string, string | boolean>, checks: number, fileCount: number): number {
    const ranks = { error: 0, warning: 1, info: 2 };
    findings.sort((a, b) => ranks[a.level] - ranks[b.level] || a.file.localeCompare(b.file) || a.ids.join().localeCompare(b.ids.join()) || a.path.localeCompare(b.path));
    const counts = { errors: findings.filter(f => f.level === 'error').length, warnings: findings.filter(f => f.level === 'warning').length, info: findings.filter(f => f.level === 'info').length, checks, files: fileCount };
    const exitCode = counts.errors ? 1 : counts.warnings && opts.strict ? 2 : 0;
    const output = opts.format === 'json' ? JSON.stringify({ ok: exitCode === 0, exitCode, findings, counts }, null, 2) : findings.map(f => `${f.level.toUpperCase().padEnd(7)}  ${f.ids.join(',')}  ${f.file}:${f.path}  ${f.message}${f.hint ? '  → ' + f.hint : ''}`).concat(`assets: ${counts.errors} errors, ${counts.warnings} warnings, ${counts.info} info (${checks} checks, ${fileCount} files)`).join('\n');
    if (opts.out)
        writeFileSync(String(opts.out), output + '\n');
    else
        process.stdout.write(output + '\n');
    return exitCode;
}
