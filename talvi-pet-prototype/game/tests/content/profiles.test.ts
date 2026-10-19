import { describe, expect, it } from 'vitest';
import { ContentError, loadContent } from '../../src/content/load';
import { PetSchema, type Pet } from '../../src/content/schema/pet';
import { runContentChecks } from '../../src/sim/checks';
import { files, manifest, rawContent } from './helpers';

const likes: Pet['likes'] = [
    { tag: 'soft', weight: 3 },
    { tag: 'seat', weight: 2 },
    { tag: 'toy', weight: 2, hidden: true },
    { tag: 'light', weight: 1 },
    { tag: 'plant', weight: 1 }
];

function profileFiles(count = 4) {
    const contentFiles = files();
    const pet = contentFiles['pets/dog.json'] as Pet;
    pet.likes = structuredClone(likes.slice(0, count));
    return { contentFiles, pet };
}

function profileFindings(contentFiles: ReturnType<typeof files>) {
    return runContentChecks(rawContent(contentFiles), manifest, { only: ['CHK-007-02'] });
}

const invalidProfiles: [string, (pet: Pet) => void][] = [
    ['duplicate like tag', pet => { pet.likes[3].tag = pet.likes[0].tag; }],
    ['weight below 1', pet => { pet.likes[3].weight = 0; }],
    ['weight above 3', pet => { pet.likes[3].weight = 4; }],
    ['fractional weight', pet => { pet.likes[3].weight = 1.5; }],
    ['two hidden likes', pet => { pet.likes[3].hidden = true; }],
    ['dislike overlapping a like', pet => { pet.dislikes = ['light']; }],
    ['missing dislike', pet => { pet.dislikes = []; }],
    ['two dislikes', pet => { pet.dislikes = ['tall', 'food']; }]
];

describe('approved 2–4 total likes profile bound', () => {
    it.each([2, 3, 4])('loads and accepts %i distinct likes', count => {
        const { contentFiles, pet } = profileFiles(count);
        expect(PetSchema.safeParse(pet).success).toBe(true);
        expect(loadContent(manifest, contentFiles).pets.dog.likes).toEqual(pet.likes);
        expect(profileFindings(contentFiles)).toEqual([]);
    });

    it.each([1, 5])('rejects %i otherwise valid likes in schema and semantic check', count => {
        const { contentFiles, pet } = profileFiles(count);
        const result = PetSchema.safeParse(pet);
        expect(result.success).toBe(false);
        if (!result.success)
            expect(result.error.issues.map(issue => issue.path)).toEqual([['likes']]);
        expect(() => loadContent(manifest, contentFiles)).toThrow(ContentError);
        expect(profileFindings(contentFiles)).toEqual([
            expect.objectContaining({
                ids: ['CHK-007-02'], level: 'error', file: 'pets/dog.json', path: '/likes',
                message: 'Pet requires 2–4 distinct likes weighted 1..3, at most 1 hidden, and 1 distinct dislike'
            })
        ]);
    });

    it.each(invalidProfiles)('still rejects %s with four likes', (_name, mutate) => {
        const { contentFiles, pet } = profileFiles();
        mutate(pet);
        expect(profileFindings(contentFiles)).toEqual([
            expect.objectContaining({ ids: ['CHK-007-02'], level: 'error', file: 'pets/dog.json', path: '/likes' })
        ]);
    });

    it.each(['like', 'dislike'])('still rejects an unknown %s tag during resolution', kind => {
        const { contentFiles, pet } = profileFiles();
        if (kind === 'like') pet.likes[3].tag = 'unknown-tag';
        else pet.dislikes[0] = 'unknown-tag';
        expect(() => loadContent(manifest, contentFiles)).toThrow('unknown-tag');
        expect(runContentChecks(rawContent(contentFiles), manifest, { only: ['CHK-CORE-02'] })).toEqual([
            expect.objectContaining({
                ids: ['CHK-CORE-02', 'CHK-007-02'], level: 'error', file: 'pets/dog.json',
                path: kind === 'like' ? '/likes/3/tag' : '/dislikes/0'
            })
        ]);
    });
});
