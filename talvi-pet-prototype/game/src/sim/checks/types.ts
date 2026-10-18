import type { Content } from '../../content/types';
import type { AssetManifest } from '../../content/schema/assets';
export type Finding = {
    ids: string[];
    level: 'error' | 'warning' | 'info';
    file: string;
    path: string;
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
};
export type CheckOptions = {
    only?: string[];
    room?: string;
    pet?: string;
};
export type Check = {
    id: string;
    ids?: string[];
    level: Finding['level'];
    run: (content: Content, manifest?: AssetManifest) => Finding[];
};
export function finding(ids: string | string[], level: Finding['level'], file: string, path: string, message: string, hint?: string, details?: Record<string, unknown>): Finding {
    return {
        ids: typeof ids === 'string' ? [
            ids
        ] : ids, level, file, path, message, ...(hint ? {
            hint
        } : {}), ...(details ? {
            details
        } : {})
    };
}
export const compareFindings = (a: Finding, b: Finding) => ({
    error: 0, warning: 1, info: 2
}[a.level] - {
    error: 0, warning: 1, info: 2
}[b.level]) || a.file.localeCompare(b.file, 'en') || a.ids.join(',').localeCompare(b.ids.join(','), 'en') || a.path.localeCompare(b.path, 'en') || a.message.localeCompare(b.message, 'en');
