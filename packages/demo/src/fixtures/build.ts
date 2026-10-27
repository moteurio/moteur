import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type { NavItem } from '@moteurio/types/Navigation.js';
import type { Persona } from '../runtime/types.js';
import type { ArtSpec } from '../runtime/assets.js';
import { uploadArt } from '../runtime/assets.js';
import { prepareFields, type UploadedArt } from '../runtime/prepare.js';
import { Timeline, settle } from '../runtime/workflow.js';
import { setDaysAgo, present } from '../runtime/clock.js';
import { asUser } from '../runtime/boot.js';
import { f } from '../runtime/fields.js';
import { scene, robotPortrait } from '../art/generators.js';
import { pdf } from '../art/media.js';
import {
    createProjectFor,
    ensurePersonas,
    installSchemas,
    validateEntries,
    type Log,
    type ValidationReport
} from '../runtime/project.js';
import { models, everyField } from './schema.js';
import { content, EXPECTED_INVALID, RAW_ENTRIES, STRINGS } from './content.js';

export const FIXTURES_ID = 'fixtures';

const bot: Persona = {
    id: 'fixtures-bot',
    name: 'Fixture Bot',
    email: 'bot@fixtures.moteur.test',
    roles: ['admin']
};

const project: ProjectSchema = {
    id: FIXTURES_ID,
    label: 'Fixtures — edge cases',
    description:
        'Every field type, extreme sizes, five locales (incl. RTL and CJK), broken references and legacy formats. Not pretty on purpose.',
    defaultLocale: 'en',
    supportedLocales: ['en', 'fr', 'ar', 'ja', 'fr-CA'],
    users: [],
    isActive: true,
    workflow: { enabled: false, mode: 'auto_publish', requireReview: false },
    git: { enabled: false }
} as ProjectSchema;

/** Images at the edges: tiny, huge, very tall, transparent, every format, awkward names. */
function art(): ArtSpec[] {
    const svgImage = (w: number, h: number, label: string, alpha = false) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${alpha ? 'none' : '#2f5d8a'}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#f2c230" fill-opacity="${alpha ? 0.6 : 1}"/><text x="10" y="${Math.min(40, h - 4)}" font-size="${Math.max(6, Math.min(32, h / 4))}" fill="#fff" font-family="DejaVu Sans">${label}</text></svg>`;
    const encode = (svg: string, format: 'gif' | 'webp' | 'avif') => () =>
        sharp(Buffer.from(svg))[format]().toBuffer();
    const alt = (en: string) => ({ en, fr: en });
    return [
        {
            key: 'landscape',
            filename: 'landscape.jpg',
            alt: alt('Landscape 1600×1000'),
            svg: () => scene({ kind: 'skyline', seed: 'fx', palette: 'industrie' }),
            format: 'jpeg'
        },
        {
            key: 'portrait',
            filename: 'very-tall.png',
            alt: alt('Very tall 300×2400'),
            svg: () => svgImage(300, 2400, 'TALL'),
            format: 'png'
        },
        {
            key: 'panorama',
            filename: 'panorama.png',
            alt: alt('Panorama 3000×200'),
            svg: () => svgImage(3000, 200, 'PANORAMA'),
            format: 'png'
        },
        {
            key: 'tiny',
            filename: 'one-pixel.png',
            alt: alt('One pixel'),
            svg: () => svgImage(1, 1, ''),
            format: 'png'
        },
        {
            key: 'transparent',
            filename: 'transparent.png',
            alt: alt('Transparent PNG'),
            svg: () => svgImage(800, 800, 'ALPHA', true),
            format: 'png'
        },
        {
            key: 'huge',
            filename: 'huge-4000.jpg',
            alt: alt('4000×4000 JPEG'),
            svg: () => svgImage(4000, 4000, 'HUGE'),
            format: 'jpeg'
        },
        {
            key: 'gif',
            filename: 'animated-ish.gif',
            alt: alt('GIF'),
            file: encode(svgImage(400, 300, 'GIF'), 'gif'),
            mimeType: 'image/gif'
        },
        {
            key: 'webp',
            filename: 'image.webp',
            alt: alt('WebP'),
            file: encode(svgImage(400, 300, 'WEBP'), 'webp'),
            mimeType: 'image/webp'
        },
        {
            key: 'avif',
            filename: 'image.avif',
            alt: alt('AVIF'),
            file: encode(svgImage(400, 300, 'AVIF'), 'avif'),
            mimeType: 'image/avif'
        },
        {
            key: 'spaces',
            filename: 'Fichier avec espaces & accents é ü 日本.png',
            alt: alt('Awkward filename'),
            svg: () => robotPortrait({ name: 'NAME TEST', palette: 'signal' }),
            format: 'png'
        },
        {
            key: 'long-name',
            filename: `${'very-long-file-name-'.repeat(10)}.PNG`,
            alt: alt('Very long filename, upper-case extension'),
            svg: () => svgImage(200, 200, 'LONG'),
            format: 'png'
        },
        {
            key: 'no-alt',
            filename: 'no-alt-text.png',
            alt: {},
            svg: () => svgImage(300, 300, 'NO ALT'),
            format: 'png'
        },
        {
            key: 'deleted-file',
            filename: 'deleted-on-disk.png',
            alt: alt('Asset whose file was deleted'),
            svg: () => svgImage(300, 300, 'GONE'),
            format: 'png'
        },
        {
            key: 'document',
            filename: 'document.pdf',
            alt: alt('PDF'),
            file: () =>
                pdf([
                    { title: 'Fixture PDF', paragraphs: [STRINGS.quotes, 'Page one.'] },
                    { title: 'Page two', paragraphs: ['Second page.'] }
                ]),
            mimeType: 'application/pdf'
        }
    ] as ArtSpec[];
}

export async function buildFixtures(opts: {
    password?: string;
    log: Log;
}): Promise<ValidationReport> {
    const { log } = opts;
    setDaysAgo(30);
    await ensurePersonas([bot], opts.password);
    await createProjectFor(project, bot, [bot]);
    await installSchemas(FIXTURES_ID, bot, {
        models,
        templates: [
            {
                id: 'everything',
                label: 'Every field',
                description: 'A template using every field type.',
                fields: Object.fromEntries(
                    Object.entries(everyField).filter(
                        ([k]) => !['relation', 'relations', 'id'].includes(k)
                    )
                )
            },
            { id: 'empty-template', label: 'Empty template', fields: {} }
        ]
    });
    const { createLayout } = await import('@moteurio/core/layouts.js');
    await createLayout(asUser(bot), FIXTURES_ID, {
        id: 'fixture-layout',
        label: 'Fixture layout',
        blocks: []
    });
    log(`schemas: ${models.length} models`);

    const uploaded = await uploadArt(FIXTURES_ID, asUser(bot), art());
    // An asset whose files are gone from disk.
    const { projectDir } = await import('@moteurio/core/utils/pathUtils.js');
    const gone = uploaded.get('deleted-file')!;
    for (const variant of ['original', 'thumb', 'medium', 'large']) {
        const dir = path.join(projectDir(FIXTURES_ID), 'assets', variant);
        for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
            if (file.startsWith(gone.assetId)) fs.rmSync(path.join(dir, file));
        }
    }
    log(`media: ${uploaded.size} files`);

    const { listBlocks } = await import('@moteurio/core/blocks.js');
    const registry = listBlocks(FIXTURES_ID) as Record<string, BlockSchema>;
    const lookup = (key: string): UploadedArt => {
        const a = uploaded.get(key);
        if (!a) throw new Error(`Unknown art "${key}"`);
        return a;
    };
    const fieldsOf = new Map(models.map(m => [m.id, m.fields]));
    const timeline = new Timeline({
        projectId: FIXTURES_ID,
        personas: [bot],
        lead: bot.id,
        reviewer: bot.id,
        prepare: (modelId, data) =>
            prepareFields(fieldsOf.get(modelId), data, { blocks: registry, art: lookup })
    });
    const entries = content();
    for (const [modelId, list] of entries)
        for (const e of list) timeline.entry(modelId, { daysAgo: 20, ...e });

    // Pages: a deep tree, a crowded level, and a page using every field type.
    const user = asUser(bot);
    timeline.at(15, 'pages', async () => {
        const { createPage } = await import('@moteurio/core/pages.js');
        let parentId: string | null = null;
        for (let depth = 1; depth <= 6; depth++) {
            const page: PageNode = await createPage(FIXTURES_ID, user, {
                type: depth < 6 ? 'folder' : 'static',
                label: `Level ${depth}`,
                slug: `level-${depth}`,
                parentId,
                ...(depth === 6 && {
                    templateId: 'empty-template',
                    status: 'published',
                    fields: {}
                })
            } as Partial<PageNode> & { type: PageNode['type']; label: string; slug: string });
            parentId = page.id;
        }
        const crowded = await createPage(FIXTURES_ID, user, {
            type: 'folder',
            label: 'Sixty siblings',
            slug: 'siblings',
            parentId: null
        } as never);
        for (let i = 1; i <= 60; i++) {
            await createPage(FIXTURES_ID, user, {
                type: 'static',
                label: `Sibling ${String(i).padStart(2, '0')}`,
                slug: `sibling-${i}`,
                parentId: (crowded as PageNode).id,
                templateId: 'empty-template',
                status: i % 4 === 0 ? 'draft' : 'published',
                fields: {}
            } as never);
        }
        const templateFields = Object.fromEntries(
            Object.entries(everyField).filter(([k]) => !['relation', 'relations', 'id'].includes(k))
        );
        const data = Object.fromEntries(
            Object.entries(
                (await import('./content.js'))
                    .content()
                    .find(([m]) => m === 'kitchen-sink')![1]
                    .find(e => e.id === 'all-filled')!.data
            ).filter(([k]) => k in templateFields)
        );
        await createPage(FIXTURES_ID, user, {
            type: 'static',
            label: 'Every field',
            slug: 'every-field',
            parentId: null,
            templateId: 'everything',
            status: 'published',
            fields: prepareFields(templateFields, data, { blocks: registry, art: lookup })
        } as never);
        await createPage(FIXTURES_ID, user, {
            type: 'collection',
            label: 'Kitchen sink',
            slug: 'kitchen-sink',
            parentId: null,
            templateId: 'empty-template',
            status: 'published',
            fields: {},
            modelId: 'kitchen-sink',
            urlPattern: '[slug]'
        } as never);
    });

    timeline.at(14, 'navigation', async () => {
        const { createNavigation } = await import('@moteurio/core/navigations.js');
        const nest = (depth: number): NavItem => ({
            id: `depth-${depth}`,
            label: `Depth ${depth} ${depth === 1 ? STRINGS.emoji.slice(0, 20) : ''}`,
            linkType: depth % 2 ? 'custom' : 'none',
            ...(depth % 2 && { customUrl: `https://example.com/${depth}` }),
            fields: {},
            children: depth < 5 ? [nest(depth + 1)] : []
        });
        await createNavigation(FIXTURES_ID, user, {
            name: 'Deep menu',
            handle: 'deep',
            type: 'menu',
            maxDepth: 5,
            items: [nest(1)]
        });
        await createNavigation(FIXTURES_ID, user, {
            name: 'Wide menu',
            handle: 'wide',
            type: 'menu',
            maxDepth: 1,
            items: Array.from({ length: 40 }, (_, i) => ({
                id: `item-${i}`,
                label: `Item ${i + 1}`,
                linkType: 'custom' as const,
                customUrl: `/item-${i}`,
                fields: {}
            }))
        });
    });

    timeline.at(13, 'form', async () => {
        const { createForm } = await import('@moteurio/core/forms.js');
        const { createSubmission } = await import('@moteurio/core/formSubmissions.js');
        await createForm(user, FIXTURES_ID, {
            id: 'everything',
            label: 'Every form field',
            status: 'active',
            honeypot: true,
            fields: {
                name: f.text('Name', { required: true }),
                email: f.email('Email', { required: true }),
                phone: f.phone('Phone'),
                age: f.number('Age', { min: 0, max: 150 }),
                choice: f.select('Choice', ['a', 'b', 'c']),
                choices: f.multiSelect('Choices', ['x', 'y', 'z']),
                agree: f.boolean('I agree'),
                date: f.date('Date'),
                time: f.time('Time'),
                address: f.address('Address'),
                message: f.textarea('Message')
            },
            createdAt: '',
            updatedAt: ''
        });
        await settle();
        for (let i = 0; i < 120; i++) {
            await createSubmission(
                FIXTURES_ID,
                'everything',
                {
                    name: i % 10 === 0 ? STRINGS.emoji : `Person ${i}`,
                    email: `person${i}@example.com`,
                    age: i,
                    choice: ['a', 'b', 'c'][i % 3],
                    choices: ['x', 'z'],
                    agree: i % 2 === 0,
                    // The longest message the server takes (10,000 characters without a maxLength).
                    message:
                        i === 7 ? STRINGS.injection : i === 8 ? 'x'.repeat(10000) : `Message ${i}`
                },
                {
                    submittedAt: new Date().toISOString(),
                    locale: ['en', 'fr', 'ar', 'ja'][i % 4],
                    ...(i % 17 === 0 && { honeypotTriggered: true })
                }
            );
        }
    });

    await timeline.run();
    present();

    // Raw files: formats core no longer writes (and some it never should).
    for (const raw of RAW_ENTRIES) {
        const dir = path.join(projectDir(FIXTURES_ID), 'models', raw.model, 'entries', raw.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'entry.json'), raw.json);
    }
    log(
        `content: ${entries.reduce((n, [, l]) => n + l.length, 0) + RAW_ENTRIES.length} entries (${RAW_ENTRIES.length} written raw)`
    );

    const report = await validateEntries(FIXTURES_ID);
    const invalid = new Set(report.errors.map(e => `${e.model}/${e.entry}`));
    const unexpected = [...invalid].filter(k => !EXPECTED_INVALID.includes(k));
    const nowValid = EXPECTED_INVALID.filter(k => !invalid.has(k));
    if (unexpected.length || nowValid.length) {
        log(
            `unexpected invalid: ${unexpected.join(', ') || 'none'}; expected invalid but valid: ${nowValid.join(', ') || 'none'}`
        );
    }
    return {
        ...report,
        // Only surprises count as invalid for the build's exit code.
        invalid: unexpected.length + nowValid.length,
        errors: report.errors.filter(e => unexpected.includes(`${e.model}/${e.entry}`))
    };
}
