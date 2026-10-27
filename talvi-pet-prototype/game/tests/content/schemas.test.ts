import { VerbsSchema } from '../../src/content/schema/verbs';
import { runContentChecks } from '../../src/sim/checks';
import { it, expect } from 'vitest';
import { ContentError, loadContent } from '../../src/content/load';
import { RewardSchema } from '../../src/content/schema/pet';
import { files, manifest, validContent } from './helpers';
it('collects issues across all family files before throwing', () => {
    const f = files();
    f['tags.json'] = {
        tags: [
            {
                id: 'BAD', name: 1
            }
        ]
    };
    f['charms.json'] = {
        types: 3
    };
    try {
        loadContent(manifest, f);
        throw new Error('Expected error');
    }
    catch (e) {
        expect(e).toBeInstanceOf(ContentError);
        const issues = (e as ContentError).issues;
        expect(issues.length).toBeGreaterThan(3);
        expect(new Set(issues.map(i => i.file))).toEqual(new Set([
            'tags.json', 'charms.json'
        ]));
    }
});
it('resolves every family and asset type with located failures', () => {
    const f = files();
    const tags = f['tags.json'] as {
        tags: {
            icon: string;
        }[];
    };
    tags.tags[0].icon = 'pets/dog-sheet';
    expect(() => loadContent(manifest, f)).toThrow('must resolve as image');
});
it('rejects removed clue reward and rejects wall slots without their side', () => {
    expect(RewardSchema.safeParse({
        kind: 'clue'
    }).success).toBe(false);
    const f = files();
    const r = f['rooms/dog-room.json'] as {
        slots: {
            wall?: string;
        }[];
    };
    delete r.slots[8].wall;
    expect(() => loadContent(manifest, f)).toThrow('wall slots require');
});
it('loads only supplied fixture values without mutating caller data', () => {
    const f = files(), before = JSON.stringify(f);
    loadContent(manifest, f);
    expect(JSON.stringify(f)).toBe(before);
    expect(validContent().pets.dog.likes).toHaveLength(3);
});
it('default Vite bundle fails explicitly until WORK-016 authors real content', () => {
    expect(() => loadContent(manifest)).toThrow(ContentError);
});
it('line-safe placeholders do not accept arbitrary template fields', () => {
    const c = validContent();
    c.pets.dog.lines.chatter[0] = 'Hello {tag}';
    const result = runContentChecks(c, manifest, { only: ['CHK-008-06'] });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('/lines/chatter/0');
});
it('verb emotes are single graphemes and rooms retain a street exit', () => {
    const f = files();
    const verbs = f['verbs.json'] as {
        verbs: {
            emote: string;
        }[];
    };
    verbs.verbs[0].emote = '😴✨';
    expect(VerbsSchema.safeParse(verbs).success).toBe(false);
    verbs.verbs[0].emote = '❤️';
    expect(VerbsSchema.safeParse(verbs).success).toBe(true);
    const room = f['rooms/dog-room.json'] as {
        doors: unknown[];
    };
    room.doors = [];
    expect(() => loadContent(manifest, f)).toThrow('room requires a door');
});
it('CN-12: every verb names its use clip (use-sit | use-lie | use-look | use-perch)', () => {
    const verbs = files()['verbs.json'] as { verbs: Record<string, unknown>[] };
    expect(VerbsSchema.safeParse(verbs).success).toBe(true);
    verbs.verbs[0].clip = 'use';
    expect(VerbsSchema.safeParse(verbs).success).toBe(false);
    delete verbs.verbs[0].clip;
    expect(VerbsSchema.safeParse(verbs).success).toBe(false);
});
