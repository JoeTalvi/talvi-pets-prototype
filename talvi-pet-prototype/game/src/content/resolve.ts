import type { AssetManifest } from './schema/assets';
import type { Content, ContentIssue } from './types';
function resolverContext(c: Content, manifest?: AssetManifest) {
    const out: ContentIssue[] = [];
    const issue = (id: string, file: string, path: (string | number)[], message: string, alias?: string) => out.push({
        code: 'custom', ids: [
            id, ...(alias ? [
                alias
            ] : [])
        ], file, path, message
    });
    const ids = (rows: {
        id: string;
    }[], file: string, path: (string | number)[], alias?: string) => {
        const seen = new Set<string>();
        rows.forEach((r, i) => {
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id) || seen.has(r.id))
                issue('CHK-CORE-01', file, [
                    ...path, i, 'id'
                ], `Invalid or duplicate id "${r.id}"`, alias);
            seen.add(r.id);
        });
    };
    const ref = (id: string, values: string[], file: string, path: (string | number)[], family: string, alias?: string) => {
        if (!values.includes(id))
            issue('CHK-CORE-02', file, path, `Unknown ${family} id "${id}"`, alias);
    };
    const tags = c.tags.map(t => t.id), types = c.charms.types.map(t => t.id), verbs = c.verbs.map(v => v.id), rooms = Object.keys(c.rooms), pets = Object.keys(c.pets), projects = c.projects.map(p => p.id), sites = (c.street.sites ?? []).map(s => s.id);
    const asset = (id: string | undefined, type: 'image' | 'spritesheet', file: string, path: (string | number)[], alias?: string) => {
        if (id === undefined || !manifest)
            return;
        const entry = manifest.entries.find(e => e.id === id);
        if (!entry || entry.type !== type)
            issue('CHK-CORE-03', file, path, `Asset "${id}" must resolve as ${type}`, alias);
    };
    return { c, manifest, out, issue, ids, ref, asset, tags, types, verbs, rooms, pets, projects, sites };
}
type Resolver = ReturnType<typeof resolverContext>;
function resolveIds(ctx: Resolver): void {
    const { c, issue, ids } = ctx;
    ids(c.tags, 'tags.json', [
        'tags'
    ], 'CHK-004-01');
    ids(c.charms.types, 'charms.json', [
        'types'
    ], 'CHK-004-02');
    ids(c.verbs, 'verbs.json', [
        'verbs'
    ], 'CHK-007-01');
    ids(c.projects, 'projects.json', [
        'projects'
    ]);
    ids(c.merchants, 'merchants.json', [
        'merchants'
    ], 'CHK-002-04');
    for (const [family, rows] of [
        [
            'rooms', c.rooms
        ], [
            'pets', c.pets
        ]
    ] as const) {
        for (const [key, row] of Object.entries(rows)) {
            if (key !== row.id)
                issue('CHK-CORE-01', `${family}/${key}.json`, [
                    'id'
                ], `File id "${key}" differs from declared id "${row.id}"`);
        }
    }
}
function resolveCatalogue(ctx: Resolver): void {
    const { c, ref, asset, tags, types } = ctx;
    c.tags.forEach((t, i) => asset(t.icon, 'image', 'tags.json', [
        'tags', i, 'icon'
    ]));
    c.charms.types.forEach((t, i) => {
        t.tags.forEach((tag, j) => ref(tag, tags, 'charms.json', [
            'types', i, 'tags', j
        ], 'tag', 'CHK-004-02'));
        asset(t.sprite, 'image', 'charms.json', [
            'types', i, 'sprite'
        ], 'CHK-004-03');
    });
    c.charms.starterSet.forEach((t, i) => ref(t.typeId, types, 'charms.json', [
        'starterSet', i, 'typeId'
    ], 'charm', 'CHK-004-04'));
    c.verbs.forEach((v, i) => v.tags.forEach((t, j) => ref(t, tags, 'verbs.json', [
        'verbs', i, 'tags', j
    ], 'tag', 'CHK-007-01')));
}
function resolveRooms(ctx: Resolver): void {
    const { c, ids, ref, asset, pets } = ctx;
    for (const [id, r] of Object.entries(c.rooms)) {
        const f = `rooms/${id}.json`;
        asset(r.background, 'image', f, [
            'background'
        ]);
        ref(r.residentPetId, pets, f, [
            'residentPetId'
        ], 'pet', 'CHK-005-08');
        ids(r.slots, f, [
            'slots'
        ], 'CHK-005-01');
        ids(r.wanderPoints, f, [
            'wanderPoints'
        ]);
        r.slots.forEach((s, i) => s.adjacent.forEach((a, j) => ref(a, r.slots.map(s => s.id), f, [
            'slots', i, 'adjacent', j
        ], 'slot', 'CHK-005-02')));
    }
}
function resolvePets(ctx: Resolver): void {
    const { c, ids, ref, asset, tags, types, verbs, pets, rooms, sites } = ctx;
    for (const [id, p] of Object.entries(c.pets)) {
        const f = `pets/${id}.json`;
        asset(p.portrait, 'image', f, [
            'portrait'
        ]);
        asset(p.sheet, 'spritesheet', f, [
            'sheet'
        ]);
        if (p.home?.kind === 'room') ref(p.home.roomId, rooms, f, ['home', 'roomId'], 'room');
        if (p.home?.kind === 'space') ref(p.home.siteId, sites, f, ['home', 'siteId'], 'site');
        p.likes.forEach((l, i) => ref(l.tag, tags, f, [
            'likes', i, 'tag'
        ], 'tag', 'CHK-007-02'));
        p.dislikes.forEach((t, i) => ref(t, tags, f, [
            'dislikes', i
        ], 'tag', 'CHK-007-02'));
        p.verbs.forEach((v, i) => ref(v.verb, verbs, f, [
            'verbs', i, 'verb'
        ], 'verb', 'CHK-007-04'));
        ids(p.wants, f, [
            'wants'
        ], 'CHK-009-01');
        p.wants.forEach((w, i) => {
            w.conditions.forEach((x, j) => {
                if (x.kind === 'tag')
                    ref(x.tag, tags, f, [
                        'wants', i, 'conditions', j, 'tag'
                    ], 'tag', 'CHK-009-02');
                if (x.kind === 'greeted')
                    ref(x.withPetId, pets, f, [
                        'wants', i, 'conditions', j, 'withPetId'
                    ], 'pet', 'CHK-009-02');
                if (x.kind === 'adjacent')
                    for (const key of [
                        'tagA', 'tagB'
                    ] as const)
                        ref(x[key], tags, f, [
                            'wants', i, 'conditions', j, key
                        ], 'tag', 'CHK-009-03');
            });
            w.reward.forEach((r, k) => {
                if (r.kind === 'items')
                    r.items.forEach((t, j) => ref(t.typeId, types, f, [
                        'wants', i, 'reward', k, 'items', j, 'typeId'
                    ], 'charm', 'CHK-009-06'));
                if (r.kind === 'verb')
                    ref(r.verb, verbs, f, [
                        'wants', i, 'reward', k, 'verb'
                    ], 'verb', 'CHK-009-06');
                if (r.kind === 'space')
                    ref(r.siteId, sites, f, [
                        'wants', i, 'reward', k, 'siteId'
                    ], 'site', 'CHK-009-06');
            });
        });
    }
}
function resolveProjects(ctx: Resolver): void {
    const { c, ref, asset, tags, types, rooms, pets } = ctx;
    c.projects.forEach((p, i) => {
        const f = 'projects.json', base = [
            'projects', i
        ];
        ref(p.interiorRoomId, rooms, f, [
            ...base, 'interiorRoomId'
        ], 'room', 'CHK-002-02');
        ref(p.residentPetId, pets, f, [
            ...base, 'residentPetId'
        ], 'pet', 'CHK-002-02');
        p.phaseRewards.forEach((ts, j) => ts.forEach((t, k) => ref(t.typeId, types, f, [
            ...base, 'phaseRewards', j, k, 'typeId'
        ], 'charm', 'CHK-002-03')));
        p.clueCards.forEach((card, j) => {
            asset(card.icon, 'image', f, [
                ...base, 'clueCards', j, 'icon'
            ]);
            if (card.hintTag)
                ref(card.hintTag, tags, f, [
                    ...base, 'clueCards', j, 'hintTag'
                ], 'tag', 'CHK-003-02');
        });
        asset(p.descriptorImage, 'image', f, [
            ...base, 'descriptorImage'
        ]);
        asset(p.silhouetteImage, 'image', f, [
            ...base, 'silhouetteImage'
        ]);
    });
    c.merchants.forEach((m, i) => asset(m.icon, 'image', 'merchants.json', [
        'merchants', i, 'icon'
    ]));
}
function resolveScenes(ctx: Resolver): void {
    const { c, issue, ids, ref, asset, projects, pets } = ctx;
    const scenes = [
        {
            id: 'street', file: 'street.json', doors: c.street.houses.map(h => h.door)
        }, ...Object.values(c.rooms).map(r => ({
            id: r.id, file: `rooms/${r.id}.json`, doors: r.doors
        }))
    ];
    for (const scene of scenes) {
        ids(scene.doors, scene.file, scene.id === 'street' ? [
            'houses'
        ] : [
            'doors'
        ], 'CHK-001-08');
        scene.doors.forEach((d, i) => {
            const path = scene.id === 'street' ? [
                'houses', i, 'door', 'target'
            ] : [
                'doors', i, 'target'
            ];
            const targetId = d.target.scene === 'street' ? 'street' : d.target.roomId;
            const target = scenes.find(s => s.id === targetId);
            if (!target)
                issue('CHK-CORE-02', scene.file, path, `Unknown target scene "${targetId}"`, 'CHK-001-03');
            else
                ref(d.target.doorId, target.doors.map(d => d.id), scene.file, [
                    ...path, 'doorId'
                ], 'door', 'CHK-001-03');
        });
    }
    (c.street.sites ?? []).forEach((site, i) => {
        asset(site.art.empty, 'image', 'street.json', ['sites', i, 'art', 'empty']);
        asset(site.art.base, 'image', 'street.json', ['sites', i, 'art', 'base']);
        ref(site.residentPetId, pets, 'street.json', ['sites', i, 'residentPetId'], 'pet');
        site.slots.forEach((slot, j) => slot.adjacent.forEach((id, k) => ref(id, site.slots.map(other => other.id), 'street.json',
            ['sites', i, 'slots', j, 'adjacent', k], 'slot')));
    });
    c.street.houses.forEach((h, i) => {
        ref(h.projectId, projects, 'street.json', [
            'houses', i, 'projectId'
        ], 'project', 'CHK-001-06');
        h.stageSprites.forEach((s, j) => asset(s, 'image', 'street.json', [
            'houses', i, 'stageSprites', j
        ]));
    });
    for (const key of [
        'groundTiles', 'props'
    ] as const)
        c.street[key].forEach((p, i) => asset(p.sprite, 'image', 'street.json', [
            key, i, 'sprite'
        ]));
}
/** Content owns resolution; load.ts never imports sim. */
export function resolveContent(c: Content, manifest?: AssetManifest): ContentIssue[] {
    const ctx = resolverContext(c, manifest);
    resolveIds(ctx);
    resolveCatalogue(ctx);
    resolveRooms(ctx);
    resolvePets(ctx);
    resolveProjects(ctx);
    resolveScenes(ctx);
    return ctx.out;
}
