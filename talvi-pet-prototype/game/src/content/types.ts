import type { Tags } from './schema/tags';
import type { Charms } from './schema/charms';
import type { Verbs } from './schema/verbs';
import type { Room } from './schema/room';
import type { Street } from './schema/street';
import type { Pet } from './schema/pet';
import type { Project } from './schema/project';
import type { Merchant } from './schema/merchant';
import type { Dialogue } from './schema/dialogue';
import type { Strings } from './schema/strings';
import type { Tuning } from './schema/tuning';
import type { Outfit } from './schema/outfits';
export type Content = {
    tags: Tags['tags'];
    charms: Charms;
    verbs: Verbs['verbs'];
    rooms: Record<string, Room>;
    street: Street;
    pets: Record<string, Pet>;
    projects: Project[];
    merchants: Merchant[];
    dialogue: Dialogue;
    strings: Strings;
    tuning: Tuning;
    outfits: Outfit[]; // WORK-037-2: content order; [] when outfits.json is absent (pre-tier-2 fixtures)
};
export type ContentFiles = Record<string, unknown>;
export type ContentIssue = {
    file: string;
    path: (string | number)[];
    message: string;
    code: string;
    ids?: string[];
};
export const pointer = (path: readonly (string | number)[]) => path.length ? '/' + path.map(p => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '';
