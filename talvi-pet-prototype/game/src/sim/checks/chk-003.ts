import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
export function check003(c: Content): Finding[] {
    const out: Finding[] = [];
    c.projects.forEach((p, i) => {
        const base = `/projects/${i}`, pet = c.pets[p.residentPetId];
        const early = new Set(pet?.wants.slice(0, 2).flatMap(w => w.conditions.flatMap(x => x.kind === 'tag' ? [
            x.tag
        ] : [])) ?? []);
        if (p.clueCards.length !== (p.completeAtStart ? 0 : 5) || Boolean(p.descriptorImage) === p.completeAtStart || Boolean(p.silhouetteImage) === p.completeAtStart)
            out.push(finding('CHK-003-01', 'error', 'projects.json', base + '/clueCards', 'Rising projects require 5 cards and both images; completed-at-start projects require 0 cards and no images'));
        p.clueCards.forEach((card, j) => {
            const path = base + `/clueCards/${j}`;
            if (!card.line.trim() || card.line.length > 90)
                out.push(finding('CHK-003-01', 'error', 'projects.json', path + '/line', 'Clue line must contain 1–90 characters'));
            if (card.hintTag && !early.has(card.hintTag))
                out.push(finding('CHK-003-03', 'warning', 'projects.json', path + '/hintTag', 'hintTag is not among the resident first two wants'));
            if (pet && j < 3 && [
                pet.name, pet.id
            ].some(s => card.line.toLowerCase().includes(s.toLowerCase())))
                out.push(finding('CHK-003-04', 'warning', 'projects.json', path + '/line', 'Clue card leaks resident name or id'));
        });
    });
    return out;
}
