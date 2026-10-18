import { resolveContent } from '../../content/resolve';
import { pointer } from '../../content/types';
import { finding, type Check } from './types';
export const coreChecks: Check[] = [
    '01', '02', '03'
].map(n => ({
    id: `CHK-CORE-${n}`, level: 'error', run: (c, m) => n === '03' && !m ? [
        finding('CHK-CORE-03', 'info', 'manifest.json', '', 'manifest not supplied; asset-id checks skipped')
    ] : resolveContent(c, m).filter(i => i.ids?.[0] === `CHK-CORE-${n}`).map(i => finding(i.ids!, 'error', i.file, pointer(i.path), i.message))
}));
