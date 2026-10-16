import type { BlockSchema } from '@moteurio/types/Block.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type { NavItem } from '@moteurio/types/Navigation.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { Timeline } from '../runtime/workflow.js';
import { prepareFields, type UploadedArt } from '../runtime/prepare.js';
import { t } from '../runtime/fields.js';
import { f } from '../runtime/fields.js';
import { tick } from '../runtime/clock.js';
import { templates } from './schema.js';
import { team, who } from './team.js';
import { b } from './content/blocks.js';
import { JOURNAL_ID } from './ids.js';

export type SiteContext = {
    lookup: (key: string) => UploadedArt;
    blocks: Record<string, BlockSchema>;
};

type PageSpec = {
    key: string;
    label: string;
    slug: string;
    parent?: string;
    type: 'static' | 'collection' | 'folder';
    template?: string;
    model?: string;
    urlPattern?: string;
    status?: 'published' | 'draft';
    navInclude?: boolean;
    sitemapInclude?: boolean;
    fields?: Record<string, unknown>;
    review?: boolean;
    daysAgo: number;
    by?: string;
};

const PAGES: PageSpec[] = [
    {
        key: 'home',
        label: 'Accueil',
        slug: '',
        type: 'static',
        template: 'home',
        daysAgo: 138,
        fields: {
            heroTitle: t(
                'Le magazine des machines qui apprennent.',
                'The magazine of machines that learn.'
            ),
            heroText: t(
                'Cinq numéros, dix ans, une ville: Montréal.',
                'Five issues, ten years, one city: Montréal.'
            ),
            heroImage: { art: 'cover-issue-05' },
            sections: [
                b.h('Dernier numéro', 'Latest issue'),
                b.image('cover-issue-05', 'Numéro 05: L’Horizon.', 'Issue 05: The Edge.'),
                b.callout('47 000', 'unités déployées', 'units deployed'),
                b.button('/fr/journal', 'Lire le Journal', 'Read the Journal')
            ]
        }
    },
    {
        key: 'journal',
        label: 'Journal',
        slug: 'journal',
        type: 'collection',
        template: 'listing',
        model: 'article',
        urlPattern: '[slug]',
        daysAgo: 137,
        fields: {
            title: t('Le Journal', 'The Journal'),
            intro: t(
                'Tous les articles, du plus récent au plus ancien.',
                'Every article, newest first.'
            )
        }
    },
    {
        key: 'numeros',
        label: 'Numéros',
        slug: 'numeros',
        type: 'collection',
        template: 'listing',
        model: 'issue',
        urlPattern: '[slug]',
        daysAgo: 137,
        fields: { title: t('Les numéros', 'Issues') }
    },
    {
        key: 'modeles',
        label: 'Modèles',
        slug: 'modeles',
        type: 'collection',
        template: 'listing',
        model: 'robot',
        urlPattern: '[slug]',
        daysAgo: 136,
        fields: {
            title: t('Le catalogue', 'The catalogue'),
            intro: t('Trente modèles, six séries.', 'Thirty models, six series.')
        }
    },
    {
        key: 'auteurs',
        label: 'Auteurs',
        slug: 'auteurs',
        type: 'collection',
        template: 'listing',
        model: 'author',
        urlPattern: '[slug]',
        daysAgo: 136,
        fields: { title: t('Les auteurs', 'Writers') }
    },
    {
        key: 'evenements',
        label: 'Événements',
        slug: 'evenements',
        type: 'collection',
        template: 'listing',
        model: 'event',
        urlPattern: '[slug]',
        daysAgo: 60,
        fields: { title: t('Événements', 'Events') }
    },
    {
        key: 'carrieres',
        label: 'Carrières',
        slug: 'carrieres',
        type: 'collection',
        template: 'listing',
        model: 'job',
        urlPattern: '[slug]',
        daysAgo: 35,
        fields: {
            title: t('Carrières', 'Careers'),
            intro: t(
                'Rejoignez la rédaction, l’usine ou l’expédition.',
                'Join the newsroom, the factory or the expedition.'
            )
        }
    },
    {
        key: 'presse',
        label: 'Presse',
        slug: 'presse',
        type: 'collection',
        template: 'listing',
        model: 'press-release',
        urlPattern: '[slug]',
        daysAgo: 100,
        navInclude: false,
        fields: { title: t('Salle de presse', 'Press room') }
    },
    { key: 'a-propos', label: 'À propos', slug: 'a-propos', type: 'folder', daysAgo: 134 },
    {
        key: 'histoire',
        label: 'Notre histoire',
        slug: 'histoire',
        parent: 'a-propos',
        type: 'static',
        template: 'basic',
        daysAgo: 133,
        fields: {
            title: t('Notre histoire', 'Our story'),
            lede: t(
                'De la rue Saint-Denis à douze pays.',
                'From Rue Saint-Denis to twelve countries.'
            ),
            body: [
                b.timeline([
                    ['1968', 'Fondation, rue Saint-Denis.', 'Founded on Rue Saint-Denis.'],
                    ['1970', 'Mémoire contextuelle.', 'Contextual memory.'],
                    ['1973', 'Usine de Rouyn-Noranda.', 'Rouyn-Noranda plant.'],
                    ['1978', '47 000 unités.', '47,000 units.']
                ]),
                b.image('scene-garage', 'Le garage, 1968.', 'The garage, 1968.')
            ],
            seo: {
                seoTitle: 'Notre histoire — Moteur Journal',
                seoDescription: 'Dix ans de Moteur Industries.'
            }
        }
    },
    {
        key: 'usine',
        label: 'Les usines',
        slug: 'usines',
        parent: 'a-propos',
        type: 'static',
        template: 'basic',
        daysAgo: 120,
        fields: {
            title: t('Les usines', 'The plants'),
            body: [b.gallery(['scene-factory', 'scene-factory-lachine'])]
        }
    },
    {
        key: 'equipe',
        label: 'L’équipe',
        slug: 'equipe',
        parent: 'a-propos',
        type: 'static',
        template: 'basic',
        status: 'draft',
        daysAgo: 7,
        by: who('marguerite'),
        review: true,
        fields: {
            title: t('L’équipe de la rédaction', 'The newsroom'),
            lede: t('Humains et non-humains.', 'Human and otherwise.')
        }
    },
    {
        key: 'contact',
        label: 'Contact',
        slug: 'contact',
        type: 'static',
        template: 'contact',
        daysAgo: 130,
        fields: {
            title: t('Nous écrire', 'Write to us'),
            intro: t(
                'Nous répondons à toutes les lettres. Délai: deux semaines, ou quatre ans pour un COMPAGNON-9.',
                'We answer every letter. Allow two weeks, or four years for a COMPAGNON-9.'
            ),
            formId: 'contact'
        }
    },
    {
        key: 'adoption',
        label: 'Demande de COMPAGNON',
        slug: 'demande-compagnon',
        type: 'static',
        template: 'contact',
        daysAgo: 90,
        fields: {
            title: t('S’inscrire sur la liste d’attente', 'Join the waiting list'),
            formId: 'adoption'
        }
    },
    {
        key: 'confidentialite',
        label: 'Confidentialité',
        slug: 'confidentialite',
        type: 'static',
        template: 'basic',
        navInclude: false,
        sitemapInclude: false,
        daysAgo: 131,
        fields: {
            title: t('Politique de confidentialité', 'Privacy policy'),
            body: [
                b.p(
                    'Nous ne vendons pas vos données. Nous n’avons d’ailleurs pas d’ordinateur assez grand pour les stocker.',
                    'We do not sell your data. We don’t even have a computer big enough to store it.'
                )
            ]
        }
    },
    {
        key: 'hors-serie',
        label: 'Hors-série',
        slug: 'hors-serie',
        type: 'static',
        template: 'basic',
        status: 'draft',
        daysAgo: 15,
        fields: {
            title: t('Hors-série: Le Signal', 'Special: The Signal'),
            lede: t('Bientôt.', 'Coming soon.')
        }
    },
    {
        key: 'archives-1968',
        label: 'Archives 1968 (ancienne page)',
        slug: 'archives-1968',
        type: 'static',
        template: 'basic',
        status: 'draft',
        navInclude: false,
        sitemapInclude: false,
        daysAgo: 139,
        fields: { title: t('Archives 1968') }
    }
];

const FORMS: FormSchema[] = [
    {
        id: 'contact',
        label: 'Contact',
        description: 'Letters to the editor and general enquiries.',
        status: 'active',
        honeypot: true,
        fields: {
            name: f.text('Nom / Name', { required: true }),
            email: f.email('Courriel / Email', { required: true }),
            subject: f.select('Sujet / Subject', ['courrier', 'abonnement', 'presse', 'autre']),
            message: f.textarea('Message', { required: true, maxLength: 2000 })
        },
        submitLabel: t('Envoyer', 'Send'),
        successMessage: t('Merci, nous vous répondrons.', 'Thank you, we will reply.'),
        notifications: {
            onSubmit: { to: ['redaction@moteur-journal.test'], subject: 'Nouveau message' }
        },
        createdAt: '',
        updatedAt: ''
    },
    {
        id: 'infolettre',
        label: 'Infolettre',
        description: 'Postal subscription to the print edition.',
        status: 'active',
        honeypot: true,
        fields: {
            name: f.text('Nom / Name', { required: true }),
            address: f.address('Adresse postale / Mailing address', { required: true }),
            language: f.select('Langue / Language', ['fr', 'en'], { required: true }),
            owner: f.boolean('Je possède une unité Moteur / I own a Moteur unit')
        },
        submitLabel: t('S’abonner', 'Subscribe'),
        createdAt: '',
        updatedAt: ''
    },
    {
        id: 'adoption',
        label: 'Liste d’attente COMPAGNON-9',
        description: 'Waiting list sign-up. Archived: the list is closed for 1979.',
        status: 'archived',
        fields: {
            name: f.text('Nom / Name', { required: true }),
            email: f.email('Courriel / Email', { required: true }),
            household: f.number('Personnes au foyer / People in household', { min: 1, max: 20 }),
            reason: f.textarea('Pourquoi un COMPAGNON? / Why a COMPAGNON?')
        },
        createdAt: '',
        updatedAt: ''
    }
];

const NAMES = [
    'Gisèle Tremblay',
    'Robert Gagnon',
    'Huguette Roy',
    'Jean-Guy Côté',
    'Ginette Bouchard',
    'Réjean Gauthier',
    'Lise Morin',
    'Normand Lavoie',
    'Pierrette Fortin',
    'Denis Gagné',
    'Nicole Ouellet',
    'Mario Pelletier',
    'Claudette Bélanger',
    'Gaétan Lévesque',
    'Johanne Bergeron'
];

function submissions(): Array<{
    form: string;
    data: Record<string, unknown>;
    daysAgo: number;
    spam?: boolean;
    locale: string;
}> {
    const out: Array<{
        form: string;
        data: Record<string, unknown>;
        daysAgo: number;
        spam?: boolean;
        locale: string;
    }> = [];
    NAMES.forEach((name, i) => {
        const email = `${name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z]+/g, '.')}@courriel.test`;
        out.push({
            form: 'contact',
            daysAgo: 80 - i * 5,
            locale: i % 3 === 0 ? 'en' : 'fr',
            data: {
                name,
                email,
                subject: ['courrier', 'abonnement', 'presse', 'autre'][i % 4],
                message:
                    i % 5 === 0
                        ? 'Mon COMPAGNON-9 me demande de vous écrire. Il vous salue.'
                        : 'Bonjour, quand paraîtra le prochain numéro?'
            }
        });
        if (i % 2 === 0) {
            out.push({
                form: 'infolettre',
                daysAgo: 70 - i * 4,
                locale: 'fr',
                data: {
                    name,
                    address: {
                        street: `${100 + i * 17}, rue Rachel Est`,
                        city: 'Montréal',
                        state: 'QC',
                        country: 'CA',
                        postalCode: 'H2J 2H6'
                    },
                    language: i % 4 === 0 ? 'en' : 'fr',
                    owner: i % 3 !== 0
                }
            });
        }
    });
    out.push({
        form: 'adoption',
        daysAgo: 100,
        locale: 'fr',
        data: {
            name: 'Famille Ouellet',
            email: 'ouellet@courriel.test',
            household: 6,
            reason: 'Pour grand-maman.'
        }
    });
    out.push({
        form: 'contact',
        daysAgo: 3,
        locale: 'en',
        spam: true,
        data: {
            name: 'BEST PRICES',
            email: 'win@spam.test',
            subject: 'autre',
            message: 'CLICK HERE for cheap robots!!! http://spam.test'
        }
    });
    out.push({
        form: 'contact',
        daysAgo: 2,
        locale: 'fr',
        spam: true,
        data: {
            name: 'x',
            email: 'x@x.test',
            subject: 'autre',
            message: '<script>alert(1)</script>'
        }
    });
    return out;
}

/** Pages, navigation, forms and submissions, layout, API collections and webhooks. */
export async function buildSite(timeline: Timeline, ctx: SiteContext): Promise<void> {
    const pageIds = new Map<string, string>();
    const templateFields = new Map(templates.map(tp => [tp.id, tp.fields]));
    const user = (id?: string) => timeline.user(id ?? team.louise.id);

    timeline.at(141, 'layout home-layout', async () => {
        const { createLayout } = await import('@moteurio/core/layouts.js');
        await createLayout(user(team.theo.id), JOURNAL_ID, {
            id: 'home-layout',
            label: 'Home layout',
            description: 'Hero, latest issue, featured articles.',
            blocks: []
        });
    });

    for (const p of PAGES) {
        timeline.at(p.daysAgo, `page ${p.key}`, async () => {
            const { createPage, updatePage } = await import('@moteurio/core/pages.js');
            const fields = p.fields
                ? prepareFields(templateFields.get(p.template ?? ''), p.fields, {
                      blocks: ctx.blocks,
                      art: ctx.lookup
                  })
                : {};
            const page = await createPage(JOURNAL_ID, user(p.by), {
                type: p.type,
                label: p.label,
                slug: p.slug,
                parentId: p.parent ? (pageIds.get(p.parent) ?? null) : null,
                navInclude: p.navInclude ?? true,
                sitemapInclude: p.sitemapInclude ?? true,
                ...(p.type !== 'folder' && { templateId: p.template, status: 'draft', fields }),
                ...(p.type === 'collection' && { modelId: p.model, urlPattern: p.urlPattern })
            } as Partial<PageNode> & { type: PageNode['type']; label: string; slug: string });
            pageIds.set(p.key, page.id);
            if (p.type !== 'folder' && (p.status ?? 'published') === 'published') {
                tick(30);
                await updatePage(JOURNAL_ID, user(), page.id, { status: 'published' });
            }
            if (p.review) {
                tick(60);
                const { submitForPageReview } = await import('@moteurio/core/reviews.js');
                await submitForPageReview(JOURNAL_ID, user(p.by), page.id, team.celeste.id);
            }
        });
    }

    timeline.at(129, 'navigation', async () => {
        const { createNavigation } = await import('@moteurio/core/navigations.js');
        const pageItem = (key: string, label: string, children: NavItem[] = []): NavItem => ({
            id: `nav-${key}`,
            label,
            linkType: 'page',
            pageId: pageIds.get(key),
            fields: {},
            children
        });
        await createNavigation(JOURNAL_ID, user(team.theo.id), {
            name: 'Menu principal',
            handle: 'main',
            type: 'menu',
            maxDepth: 2,
            items: [
                pageItem('journal', 'Journal'),
                pageItem('numeros', 'Numéros'),
                pageItem('modeles', 'Modèles'),
                pageItem('a-propos', 'À propos', [
                    pageItem('histoire', 'Notre histoire'),
                    pageItem('usine', 'Les usines')
                ]),
                {
                    id: 'nav-boutique',
                    label: 'Boutique ↗',
                    linkType: 'custom',
                    customUrl: 'https://boutique.moteur.test',
                    openInNewTab: true,
                    fields: {}
                }
            ]
        });
        await createNavigation(JOURNAL_ID, user(team.theo.id), {
            name: 'Pied de page',
            handle: 'footer',
            type: 'menu',
            maxDepth: 1,
            items: [
                pageItem('contact', 'Contact'),
                pageItem('presse', 'Presse'),
                pageItem('carrieres', 'Carrières'),
                pageItem('confidentialite', 'Confidentialité')
            ]
        });
        await createNavigation(JOURNAL_ID, user(team.theo.id), {
            name: 'Plan du site (vide)',
            handle: 'sitemap',
            type: 'sitemap',
            maxDepth: 3,
            items: []
        });
    });

    timeline.at(128, 'forms', async () => {
        const { createForm } = await import('@moteurio/core/forms.js');
        for (const form of FORMS) await createForm(user(team.theo.id), JOURNAL_ID, form);
    });

    for (const s of submissions()) {
        timeline.at(s.daysAgo, `submission ${s.form}`, async () => {
            const { createSubmission } = await import('@moteurio/core/formSubmissions.js');
            await createSubmission(JOURNAL_ID, s.form, s.data, {
                submittedAt: new Date().toISOString(),
                locale: s.locale,
                userAgent: 'Mozilla/5.0 (Minitel; 1979)',
                ...(s.spam && { honeypotTriggered: true })
            });
        });
    }

    timeline.at(127, 'api collections', async () => {
        const { createCollection, listCollections } =
            await import('@moteurio/core/apiCollections.js');
        if ((await listCollections(JOURNAL_ID)).length > 0) return;
        await createCollection(JOURNAL_ID, user(team.theo.id), {
            id: 'public',
            label: 'Site public',
            description: 'Everything the public site reads.',
            resources: [
                { resourceType: 'page', resourceId: 'pages' },
                { resourceType: 'model', resourceId: 'models' },
                { resourceType: 'layout', resourceId: 'layouts' },
                { resourceType: 'form', resourceId: 'forms' }
            ]
        });
        await createCollection(JOURNAL_ID, user(team.theo.id), {
            id: 'catalogue',
            label: 'Catalogue (application mobile)',
            description: 'Robots and series only, for the catalogue app.',
            resources: [
                {
                    resourceType: 'model',
                    resourceId: 'robot',
                    fields: ['name', 'slug', 'series', 'status', 'price', 'image'],
                    resolve: 1
                },
                { resourceType: 'model', resourceId: 'series' }
            ]
        } as never);
    });

    // Webhooks last: once they exist, every change would try to deliver.
    timeline.atPresent(async () => {
        const { createWebhook, updateWebhook } =
            await import('@moteurio/core/webhooks/webhookService.js');
        try {
            await createWebhook(JOURNAL_ID, who('theo'), {
                name: 'Rebuild the public site',
                url: 'https://example.com/hooks/moteur-journal/rebuild',
                events: ['entry.published', 'entry.unpublished', 'page.published'],
                filters: [
                    { field: 'modelId', operator: 'in', value: ['article', 'issue', 'robot'] }
                ]
            });
            const paused = await createWebhook(JOURNAL_ID, who('theo'), {
                name: 'Notify the newsroom (paused)',
                url: 'https://example.com/hooks/moteur-journal/newsroom',
                events: [
                    'review.submitted',
                    'review.approved',
                    'review.rejected',
                    'comment.created'
                ]
            });
            await updateWebhook(JOURNAL_ID, who('theo'), paused.id, { enabled: false });
        } catch (err) {
            console.warn('[demo] Webhooks not created (offline?):', (err as Error).message);
        }
    });
}
