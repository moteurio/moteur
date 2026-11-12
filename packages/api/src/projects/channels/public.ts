import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    listChannels,
    getChannel,
    createChannel,
    updateChannel,
    deleteChannel
} from '@moteurio/core/channels.js';
import { requireDeveloper } from '../../middlewares/auth.js';
import {
    getEntryForProject,
    getPublishedEntryForProject,
    queryEntriesForProject,
    settingsEntryId
} from '@moteurio/core/entries.js';
import { listPages, getPage, getPageBySlug, resolveEntryUrl } from '@moteurio/core/pages.js';
import { publicPage, publicPages } from '@moteurio/core/pages/publishedPages.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { selectFields, selectFieldsFromList } from '@moteurio/core/fieldSelection.js';
import {
    resolveEntryReferences,
    resolveFieldReferences,
    type EntryResolver,
    type ReferenceSchemas
} from '@moteurio/core/referenceResolution.js';
import { EntryReadBudget } from '../../utils/entryReadBudget.js';
import { resolveEntryAssets, resolvePageAssets } from '@moteurio/core/assets/assetResolver.js';
import { getModelSchemaForProject } from '@moteurio/core/models.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { channelSchema, schemaTypes } from '@moteurio/core/publicSchema.js';
import {
    localeSchemas,
    localizeEntry,
    localizeFields,
    type LocaleChoice,
    type LocaleSchemas
} from '@moteurio/core/entryLocaleResolution.js';
import {
    pageLinkContext,
    resolvePageLinks,
    type PageLinkContext,
    type PageLinkOptions
} from '@moteurio/core/pageLinks.js';
import {
    listNavigations,
    getNavigationByHandle,
    resolveNavigation
} from '@moteurio/core/navigations.js';
import { toPublicForm } from '../../utils/publicForm.js';
import { deliverBlocks, type BlockDeliveryContext } from '@moteurio/core/blockDelivery.js';
import { stripEditorialBlocksFromPayload } from '../../utils/stripBlockSchema.js';
import { listBlocks } from '@moteurio/core/blocks.js';
import {
    cachedAnswer,
    deliveryCacheEnabled,
    keepAnswer,
    projectVersion
} from '@moteurio/core/deliveryCache.js';
import { getProjectJson, listProjectKeys } from '@moteurio/core/utils/projectStorage.js';
import {
    layoutKey,
    layoutListPrefix,
    formKey,
    formListPrefix
} from '@moteurio/core/utils/storageKeys.js';
import type { Layout } from '@moteurio/types/Layout.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { ChannelResource } from '@moteurio/types/Channel.js';
import type { Entry, EntryStatus, ModelSchema } from '@moteurio/types/Model.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';
import type { EntryQuery } from '@moteurio/core/contentIndex/index.js';
import { entryQueryParameters, parseEntryQuery } from '../../utils/entryQuery.js';
import { queryFlag, resolveAssetsParameter, resolveUrlParameter } from '../../utils/queryFlag.js';
import {
    channelPublicApiPaths,
    loadChannelOpenApiDocument
} from '../../openapi/loadChannelOpenApi.js';
import { inLanguage } from '@moteurio/core/pages/urlResolver.js';

const router: Router = Router({ mergeParams: true });

/**
 * Decides whether this request sees drafts and stores the result in `req.previewAuth` for the handlers
 * that follow. A preview link for the whole project shows every draft. A preview link for one entry or
 * page shows only that item in its current state, and everything else as published.
 */
function previewing(
    req: Request,
    item?: { modelId?: string; entryId?: string; pageId?: string }
): boolean {
    if (!req.previewTokenId) return (req.previewAuth = false);
    const { previewModelId: modelId, previewEntryId: entryId, previewPageId: pageId } = req;
    req.previewAuth =
        (!entryId && !pageId) ||
        (!!entryId && item?.modelId === modelId && item?.entryId === entryId) ||
        (!!pageId && item?.pageId === pageId);
    return req.previewAuth;
}

/** True for a preview link made for one entry or page. Everything around that item (its references and links) is shown as published. */
const previewsOneItem = (req: Request): boolean =>
    !!req.previewTokenId && !!(req.previewEntryId || req.previewPageId);

router.use((req, _res, next) => {
    previewing(req);
    next();
});

/** Responses currently being generated, keyed by request. Identical concurrent requests wait for the first one instead of repeating the work. */
const inFlight = new Map<
    string,
    Promise<{ body: string; headers: Record<string, string> } | undefined>
>();

/**
 * Caches the responses that sites request repeatedly, until the project changes (core/deliveryCache.ts).
 * Only published content read with an API key is cached, because it is identical for every reader using
 * that key. The key is part of the cache key, so the key's channel limits still apply to cached responses.
 * The schema and OpenAPI routes set their own ETag and are not cached here.
 */
router.use((req, res, next) => {
    const projectId = (req.params as Record<string, string>).projectId;
    if (
        req.method !== 'GET' ||
        !projectId ||
        !req.apiKeyAuth ||
        !req.apiKeyId ||
        req.user ||
        req.previewTokenId ||
        !deliveryCacheEnabled() ||
        /\/(schema|types|openapi(\.json)?)$/.test(req.path)
    )
        return next();
    const request = `${req.apiKeyId}\0${req.originalUrl}`;
    const version = projectVersion(projectId);
    const send = (answer: { body: string; headers: Record<string, string> }, how: string) => {
        for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
        res.setHeader('X-Moteur-Cache', how);
        res.type('application/json').send(answer.body);
    };
    const kept = cachedAnswer(projectId, version, request);
    if (kept) return void send(kept, 'hit');
    // Another request is already generating this response. Right after a change every request
    // misses the cache at once, so wait for that one instead of repeating the work.
    const flightKey = `${projectId}\0${version}\0${request}`;
    const flying = inFlight.get(flightKey);
    if (flying) return void flying.then(answer => (answer ? send(answer, 'shared') : next()), next);
    let land!: (answer: { body: string; headers: Record<string, string> } | undefined) => void;
    inFlight.set(flightKey, new Promise(resolve => (land = resolve)));
    const done = (answer?: { body: string; headers: Record<string, string> }) => {
        if (inFlight.has(flightKey)) {
            inFlight.delete(flightKey);
            land(answer);
        }
    };
    // Whatever the outcome (an error, a 404), release the waiting requests so they continue on their own.
    res.on('close', () => done());
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
        if (res.statusCode === 200) {
            const text = JSON.stringify(body);
            const total = res.getHeader('X-Total-Count');
            const headers: Record<string, string> =
                total != null ? { 'X-Total-Count': String(total) } : {};
            keepAnswer(projectId, version, request, text, headers);
            done({ body: text, headers });
            res.setHeader('X-Moteur-Cache', 'miss');
            return res.type('application/json').send(text);
        }
        done();
        return json(body);
    };
    next();
});

async function respondChannelOpenApi(req: Request, res: Response): Promise<void> {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId) {
        res.status(400).json({ error: 'Missing projectId or channelId' });
        return;
    }
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    const doc = await loadChannelOpenApiDocument(projectId, channelId);
    if (!doc) {
        res.status(404).json({ error: 'Channel not found' });
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json(doc);
}

function parseLocaleQuery(req: Request): string | undefined {
    const raw = req.query.locale ?? req.query.lang;
    const s =
        typeof raw === 'string'
            ? raw.trim()
            : Array.isArray(raw) && typeof raw[0] === 'string'
              ? raw[0].trim()
              : '';
    return s || undefined;
}

/**
 * True when the request must see only published content: a bare API key, or a preview link
 * (made for one entry or page) used outside the item it previews, without a JWT.
 */
function isPublishedOnlyDelivery(req: Request): boolean {
    if (req.user) return false;
    if (req.previewAuth) return false;
    return Boolean(req.apiKeyAuth || req.previewTokenId);
}

function getStatusFilter(
    resource: ChannelResource,
    apiKeyOnly: boolean,
    previewAuth?: boolean
): EntryStatus[] {
    if (apiKeyOnly) return ['published'];
    const status = resource.filters?.status;
    if (status == null) {
        if (previewAuth) return ['draft', 'in_review', 'published'];
        return ['published'];
    }
    return Array.isArray(status) ? status : [status];
}

/**
 * The pages that links and page relations may point to for this reader: the pages the channel exposes
 * (according to its page filter), or published pages when the channel has no page resource. Drafts are
 * included in a preview.
 */
function pageLinkOptions(
    channel: { resources: ChannelResource[] },
    req: Request,
    drafts: boolean
): PageLinkOptions {
    const pageResource = channel.resources.find(r => r.resourceType === 'page');
    const statuses: string[] = pageResource
        ? getStatusFilter(pageResource, !drafts && isPublishedOnlyDelivery(req), drafts)
        : drafts
          ? ['draft', 'published']
          : ['published'];
    return { isLive: page => statuses.includes(page.status), locale: parseLocaleQuery(req) };
}

/** Data that a delivery loads once and shares across all of its items. */
type Delivery = {
    projectId: string;
    /** Blocks, structures and model schemas, used to traverse fields at any depth. */
    schemas: LocaleSchemas;
    links: PageLinkContext;
    linkOptions: PageLinkOptions;
    /** The `?locale=` choice: every multilingual value is reduced to this language. */
    choice?: LocaleChoice;
    resolveAssets: boolean;
    /** How relations to entries in a page's fields are inlined, to the depth set by the page resource's `resolve`. */
    pageReferences: { depth: 0 | 1 | 2; statuses: EntryStatus[]; resolve: EntryResolver };
};

async function deliveryFor(
    projectId: string,
    channel: { resources: ChannelResource[] },
    req: Request
): Promise<Delivery> {
    const resource = channel.resources.find(r => r.resourceType === 'page');
    const drafts = !!req.previewAuth && !previewsOneItem(req);
    const links = await pageLinkContext(projectId, {
        published:
            previewsOneItem(req) ||
            (!drafts &&
                (!resource ||
                    usePublishedEntryView(
                        req,
                        getStatusFilter(resource, isPublishedOnlyDelivery(req), req.previewAuth)
                    )))
    });
    const locale = parseLocaleQuery(req);
    // Page relations expose only what a site may see: published entries (drafts too in a draft
    // preview), only from models the channel exposes, and only the allowed fields.
    const budget = new EntryReadBudget(drafts ? getEntryForProject : getPublishedEntryForProject);
    return {
        projectId,
        pageReferences: {
            depth: (resource?.resolve ?? 0) as 0 | 1 | 2,
            statuses: drafts ? ['draft', 'published'] : ['published'],
            resolve: channelResolver(channel, budget.resolve)
        },
        schemas: await localeSchemas(projectId, links.schemas.blocks),
        links,
        linkOptions: pageLinkOptions(channel, req, drafts),
        choice: locale ? { locale, fallback: links.defaultLocale } : undefined,
        resolveAssets: queryFlag(req.query.resolveAssets)
    };
}

/**
 * Sends content as sites receive it. Editorial blocks (such as editor notes) are removed wherever they
 * appear, then plugins add their output to the remaining blocks (for example an embed's HTML).
 */
async function sendContent(
    res: Response,
    blocks: Record<string, BlockSchema>,
    payload: unknown,
    context: BlockDeliveryContext
): Promise<void> {
    res.json(await deliverBlocks(stripEditorialBlocksFromPayload(payload, blocks), context));
}

/**
 * Chooses the language an item is delivered in: the requested language if the item has it, otherwise
 * the default language. Each item gets its own choice, which also records the fields that fell back.
 */
function choiceFor(item: { languages?: string[] }, d: Delivery): LocaleChoice | undefined {
    if (!d.choice) return undefined;
    const lang = { locale: d.choice.locale, defaultLocale: d.choice.fallback };
    return {
        locale: inLanguage(item, lang) ? d.choice.locale : d.choice.fallback,
        fallback: d.choice.fallback,
        fallbacks: []
    };
}

/** Describes the language of a delivered item: the locale it is in and which fields are not translated. */
const languageNote = (choice: LocaleChoice | undefined) =>
    choice
        ? {
              locale: choice.locale,
              ...(choice.fallbacks?.length && { fallbacks: choice.fallbacks })
          }
        : {};

/**
 * Builds a page as it is delivered: relations to entries are inlined (according to the page resource's
 * `resolve`), links and page relations are filled in, then assets are resolved (an image's alt text may
 * come from the asset), and finally the page is reduced to one language (the default language when the
 * page is not available in the requested one).
 */
async function deliverPage(page: PageNode, d: Delivery): Promise<PageNode> {
    if (page.type === 'folder') return page;
    const template = d.links.templates?.get(page.templateId);
    if (!template) return page;
    const own = template.fields as ModelSchema['fields'];
    const { depth, statuses, resolve } = d.pageReferences;
    // Resolve relations to entries wherever they appear, in the page's fields and in its blocks.
    const related = depth
        ? await resolveFieldReferences(page.fields ?? {}, own, {
              projectId: d.projectId,
              depth,
              statusFilter: statuses,
              entryResolver: resolve,
              schemas: referenceSchemas(d)
          })
        : page.fields;
    const linked = (await resolvePageLinks(related, own, d.links, d.linkOptions)) ?? related;
    let out = { ...page, fields: linked };
    if (d.resolveAssets) out = await resolvePageAssets(d.projectId, out, template, d.schemas);
    const choice = choiceFor(page, d);
    const fields = choice
        ? ((await localizeFields(out.fields, own, d.schemas, choice)) ?? out.fields)
        : out.fields;
    // Include the page's path so a site's route needs nothing else. `paths` only lists the page's own languages.
    const paths = d.links.urls(page.id);
    const path = paths[choice?.locale ?? d.links.defaultLocale] ?? paths[d.links.defaultLocale];
    const delivered = { ...out, path, paths, fields, ...languageNote(choice) };
    return delivered;
}

/** Builds an entry as it is delivered, once its references are inlined: links and assets are resolved and the entry is reduced to one language. */
async function deliverEntry(entry: Entry, schema: ModelSchema | null, d: Delivery): Promise<Entry> {
    if (!schema) return entry;
    const data = await resolvePageLinks(entry.data, schema.fields, d.links, d.linkOptions);
    let out: Entry = { ...entry, data: data ?? entry.data };
    if (d.resolveAssets) out = await resolveEntryAssets(d.projectId, out, schema, d.schemas);
    const choice = choiceFor(entry, d);
    return choice
        ? { ...(await localizeEntry(out, d.schemas, choice)), ...languageNote(choice) }
        : out;
}

/** Provides the schemas used to resolve relations wherever they appear and however they are stored. */
const referenceSchemas = (d: Delivery): ReferenceSchemas => ({
    model: d.schemas.model!,
    walk: d.schemas
});

function usePublishedEntryView(req: Request, statuses: EntryStatus[]): boolean {
    if (req.previewAuth) return false;
    return statuses.length === 1 && statuses[0] === 'published';
}

function findResource(
    channel: { resources: ChannelResource[] },
    resourceId: string
): ChannelResource | undefined {
    return channel.resources.find(r => r.resourceId === resourceId);
}

/**
 * Resolves references as the channel exposes them: an entry of a model the channel exposes, limited to
 * that model's allowed fields. Any other reference stays a plain reference.
 */
function channelResolver(
    channel: { resources: ChannelResource[] },
    resolve: EntryResolver
): EntryResolver {
    return async (projectId, modelId, entryId) => {
        const resource =
            findResource(channel, modelId) ??
            channel.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (resource?.resourceType !== 'model') return null;
        const entry = await resolve(projectId, modelId, entryId);
        return entry && resource.fields?.length ? selectFields(entry, resource.fields) : entry;
    };
}

function filterChannelsForApiKey<T extends { id: string }>(req: Request, list: T[]): T[] {
    if (req.user) return list;
    const w = req.apiKeyPolicy?.channelAllowlist;
    if (w == null) return list;
    const allow = new Set(w);
    return list.filter(c => allow.has(c.id));
}

function rejectIfApiKeyChannelForbidden(req: Request, res: Response, channelId: string): boolean {
    if (req.user) return false;
    const w = req.apiKeyPolicy?.channelAllowlist;
    if (w == null) return false;
    if (w.includes(channelId)) return false;
    res.status(403).json({
        error: 'This API key cannot access this channel',
        code: 'API_KEY_CHANNEL_NOT_ALLOWED'
    });
    return true;
}

function rejectIfPreviewChannelMismatch(req: Request, res: Response, channelId: string): boolean {
    if (!req.previewTokenId) return false;
    const scoped = req.previewChannelId;
    if (!scoped || scoped === channelId) return false;
    res.status(403).json({
        error: 'Preview token is not valid for this channel',
        code: 'PREVIEW_CHANNEL_MISMATCH'
    });
    return true;
}

function rejectIfChannelAccessForbidden(req: Request, res: Response, channelId: string): boolean {
    return (
        rejectIfApiKeyChannelForbidden(req, res, channelId) ||
        rejectIfPreviewChannelMismatch(req, res, channelId)
    );
}

/**
 * Applies a preview link made for one page to a list. The page is shown in its current state, replacing
 * its published version or added to the list if it has none, provided the channel exposes pages of that kind.
 */
async function withPreviewedPage(
    req: Request,
    projectId: string,
    resource: ChannelResource,
    pages: PageNode[]
): Promise<PageNode[]> {
    const id = req.previewPageId;
    if (!id || req.previewAuth) return pages;
    const page = await getPage(projectId, id).catch(() => null);
    if (!page || page.type === 'folder') return pages;
    if (resource.resourceId !== 'pages' && page.templateId !== resource.resourceId) return pages;
    if (!getStatusFilter(resource, false, true).includes(page.status as EntryStatus)) return pages;
    const at = pages.findIndex(p => p.id === id);
    return at < 0 ? [...pages, page] : pages.map(p => (p.id === id ? page : p));
}

/**
 * Applies a preview link made for one entry to a list. The other entries are shown as published, and the
 * previewed entry is shown in its current state at its current position. It is omitted when its edits no
 * longer match the query, and the total is increased by one when it has never been published.
 */
async function withPreviewedEntry(
    req: Request,
    projectId: string,
    modelId: string,
    resource: ChannelResource,
    query: EntryQuery,
    found: { items: Entry[]; total: number }
): Promise<{ items: Entry[]; total: number }> {
    const id = req.previewEntryId;
    if (!id || req.previewAuth || req.previewModelId !== modelId) return found;
    const draft = await getEntryForProject(projectId, modelId, id).catch(() => null);
    if (!draft) return found;
    const { items: latest } = await queryEntriesForProject(projectId, modelId, {
        ...query,
        view: 'latest',
        status: getStatusFilter(resource, false, true)
    });
    const at = latest.findIndex(e => e.id === id);
    const items = found.items.filter(e => e.id !== id);
    if (at < 0) return { items, total: found.total };
    items.splice(Math.min(at, items.length), 0, latest[at]);
    const published = await getPublishedEntryForProject(projectId, modelId, id);
    return { items, total: found.total + (published ? 0 : 1) };
}

// GET /projects/:projectId/channels
router.get('/', async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const list = await listChannels(projectId);
        return void res.json(filterChannelsForApiKey(req, list));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// OpenAPI spec. Register this before `/:channelId` because of Express 5 path matching.
router.get('/:channelId/openapi', async (req: Request, res: Response) => {
    try {
        await respondChannelOpenApi(req, res);
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});
router.get('/:channelId/openapi.json', async (req: Request, res: Response) => {
    try {
        await respondChannelOpenApi(req, res);
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

/** Responds with the channel's schema or the TypeScript types generated from it. Answers 304 to a matching `If-None-Match`. */
async function respondChannelSchema(req: Request, res: Response, as: 'json' | 'types') {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (rejectIfChannelAccessForbidden(req, res, channelId!)) return;
    const schema = await channelSchema(projectId!, channelId!);
    if (!schema) return void res.status(404).json({ error: 'Channel not found' });
    const etag = `"${schema.version}${as === 'types' ? '-ts' : ''}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return void res.status(304).end();
    if (as === 'json') return void res.json(schema);
    res.type('text/plain; charset=utf-8');
    res.send(schemaTypes(schema));
}

// GET /projects/:projectId/channels/:channelId/schema
router.get('/:channelId/schema', async (req: Request, res: Response) => {
    try {
        await respondChannelSchema(req, res, 'json');
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/types
router.get('/:channelId/types', async (req: Request, res: Response) => {
    try {
        await respondChannelSchema(req, res, 'types');
    } catch (err: unknown) {
        sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId
router.get('/:channelId', async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        return void res.json({
            ...channel,
            publicApi: channelPublicApiPaths(projectId, channelId)
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Write routes (JWT and project access required).
router.post('/', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const { id, label, description, resources } = req.body ?? {};
        const channel = await createChannel(projectId, req.user!, {
            id,
            label: label ?? 'Unnamed',
            description,
            resources: resources ?? []
        });
        return void res.status(201).json(channel);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});
router.patch('/:channelId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    try {
        const patch = req.body ?? {};
        const channel = await updateChannel(projectId, req.user!, channelId, patch);
        return void res.json(channel);
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to update channel'
        });
    }
});
router.delete('/:channelId', requireDeveloper, async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    try {
        await deleteChannel(projectId, req.user!, channelId);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void res.status(getMessage(err)?.includes('not found') ? 404 : 400).json({
            error: getMessage(err) ?? 'Failed to delete channel'
        });
    }
});

// GET /projects/:projectId/channels/:channelId/pages
router.get('/:channelId/pages', async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const pageResource = channel.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Channel does not expose pages' });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        let pages = await listPages(projectId, {
            templateId: pageResource.resourceId === 'pages' ? undefined : pageResource.resourceId
        });
        // Sites get each page as published. Changes that are waiting for review are not included.
        if (usePublishedEntryView(req, statuses)) pages = await publicPages(projectId, pages);
        pages = pages.filter(p => 'status' in p && statuses.includes((p as any).status));
        pages = await withPreviewedPage(req, projectId, pageResource, pages);
        const delivery = await deliveryFor(projectId, channel, req);
        pages = await Promise.all(pages.map(p => deliverPage(p, delivery)));
        return void (await sendContent(res, delivery.schemas.blocks, pages, {
            projectId: delivery.projectId,
            locale: delivery.choice?.locale
        }));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/pages/by-slug/:slug
router.get('/:channelId/pages/by-slug/:slug', async (req: Request, res: Response) => {
    const { projectId, channelId, slug } = req.params as Record<string, string>;
    if (!projectId || !channelId || slug === undefined)
        return void res.status(400).json({ error: 'Missing projectId, channelId or slug' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const pageResource = channel.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Channel does not expose pages' });
        if (req.previewPageId) {
            const page = await getPageBySlug(projectId, slug, parseLocaleQuery(req));
            previewing(req, { pageId: page?.id });
        }
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        const stored = await getPageBySlug(projectId, slug, parseLocaleQuery(req), {
            published: usePublishedEntryView(req, statuses)
        });
        if (!stored) return void res.status(404).json({ error: 'Page not found' });
        if (!('status' in stored) || !statuses.includes((stored as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        const delivery = await deliveryFor(projectId, channel, req);
        return void (await sendContent(
            res,
            delivery.schemas.blocks,
            await deliverPage(stored, delivery),
            { projectId: delivery.projectId, locale: delivery.choice?.locale }
        ));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/pages/:id
router.get('/:channelId/pages/:id', async (req: Request, res: Response) => {
    const { projectId, channelId, id } = req.params as Record<string, string>;
    if (!projectId || !channelId || !id)
        return void res.status(400).json({ error: 'Missing projectId, channelId or id' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const pageResource = channel.resources.find(r => r.resourceType === 'page');
        if (!pageResource)
            return void res.status(404).json({ error: 'Channel does not expose pages' });
        previewing(req, { pageId: id });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(pageResource, apiKeyOnly, req.previewAuth);
        const file = await getPage(projectId, id);
        const stored = usePublishedEntryView(req, statuses)
            ? await publicPage(projectId, file)
            : file;
        if (!stored) return void res.status(404).json({ error: 'Page not found' });
        if (!('status' in stored) || !statuses.includes((stored as any).status))
            return void res.status(404).json({ error: 'Page not found' });
        const delivery = await deliveryFor(projectId, channel, req);
        return void (await sendContent(
            res,
            delivery.schemas.blocks,
            await deliverPage(stored, delivery),
            { projectId: delivery.projectId, locale: delivery.choice?.locale }
        ));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/:resourceId/entries
router.get('/:channelId/:resourceId/entries', async (req: Request, res: Response) => {
    const { projectId, channelId, resourceId } = req.params as Record<string, string>;
    if (!projectId || !channelId || !resourceId)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const resource =
            findResource(channel, resourceId) ??
            channel.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in channel' });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(resource, apiKeyOnly, req.previewAuth);
        const usePublished = usePublishedEntryView(req, statuses);
        let parsed: EntryQuery;
        try {
            parsed = parseEntryQuery(req, { allowStatus: false });
        } catch (err: unknown) {
            return void res.status(400).json({ error: (err as Error).message });
        }
        const found = await queryEntriesForProject(projectId, resourceId, {
            ...parsed,
            view: usePublished ? 'published' : 'latest',
            status: statuses
        });
        const { items: entries, total } = await withPreviewedEntry(
            req,
            projectId,
            resourceId,
            resource,
            parsed,
            found
        );
        res.setHeader('X-Total-Count', String(total));
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        const readBudget = new EntryReadBudget(
            usePublished ? getPublishedEntryForProject : getEntryForProject
        );
        entries.forEach(entry => readBudget.include(entry));
        const resolver = channelResolver(channel, readBudget.resolve);
        const delivery = await deliveryFor(projectId, channel, req);
        const references = referenceSchemas(delivery);
        const schema = await getModelSchemaForProject(projectId, resourceId);
        const resolved = await Promise.all(
            entries.map(async e =>
                deliverEntry(
                    await resolveEntryReferences(
                        e,
                        projectId,
                        resourceId,
                        depth,
                        new Set(),
                        statuses,
                        resolver,
                        references
                    ),
                    schema,
                    delivery
                )
            )
        );
        const locale = delivery.choice?.locale;
        let projected = selectFieldsFromList(resolved, fields);
        if (queryFlag(req.query.resolveUrl)) {
            projected = await Promise.all(
                projected.map(async (item: any) => {
                    const url = await resolveEntryUrl(projectId, item.id, resourceId, locale);
                    return { ...item, ...(url != null && { resolvedUrl: url }) };
                })
            );
        }
        return void (await sendContent(res, delivery.schemas.blocks, projected, {
            projectId: delivery.projectId,
            locale: delivery.choice?.locale
        }));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/settings/:modelId
// Returns a settings model's single entry, delivered the same way as the entry route.
router.get('/:channelId/settings/:modelId', async (req: Request, res: Response) => {
    const { projectId, channelId, modelId } = req.params as Record<string, string>;
    if (!projectId || !channelId || !modelId)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const id = await settingsEntryId(projectId, modelId);
        if (!id) return void res.status(404).json({ error: 'No settings yet' });
        Object.assign(req.params, { resourceId: modelId, id });
        return void (await deliverOneEntry(req, res));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/:resourceId/entries/:id
router.get('/:channelId/:resourceId/entries/:id', (req: Request, res: Response) =>
    deliverOneEntry(req, res)
);

/** Delivers one entry of a channel's model, as the channel exposes it. */
async function deliverOneEntry(req: Request, res: Response): Promise<void> {
    const { projectId, channelId, resourceId, id } = req.params as Record<string, string>;
    if (!projectId || !channelId || !resourceId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const resource =
            findResource(channel, resourceId) ??
            channel.resources.find(r => r.resourceType === 'model' && r.resourceId === 'models');
        if (!resource || resource.resourceType !== 'model')
            return void res.status(404).json({ error: 'Resource not found in channel' });
        previewing(req, { modelId: resourceId, entryId: id });
        const apiKeyOnly = isPublishedOnlyDelivery(req);
        const statuses = getStatusFilter(resource, apiKeyOnly, req.previewAuth);
        const usePublished = usePublishedEntryView(req, statuses);
        const entry = usePublished
            ? await getPublishedEntryForProject(projectId, resourceId, id)
            : await getEntryForProject(projectId, resourceId, id);
        if (!entry) return void res.status(404).json({ error: 'Entry not found' });
        if (!statuses.includes((entry.status ?? 'draft') as EntryStatus))
            return void res.status(404).json({ error: 'Entry not found' });
        const depth = (resource.resolve ?? 0) as 0 | 1 | 2;
        // A preview link made for this entry shows the entry in its current state and everything it points to as published.
        const around = previewsOneItem(req);
        const readBudget = new EntryReadBudget(
            usePublished || around ? getPublishedEntryForProject : getEntryForProject
        );
        readBudget.include(entry);
        const singleResolver = channelResolver(channel, readBudget.resolve);
        const delivery = await deliveryFor(projectId, channel, req);
        const resolved = await deliverEntry(
            await resolveEntryReferences(
                entry,
                projectId,
                resourceId,
                depth,
                new Set(),
                around ? ['published'] : statuses,
                singleResolver,
                referenceSchemas(delivery)
            ),
            await getModelSchemaForProject(projectId, resourceId),
            delivery
        );
        const localeOne = delivery.choice?.locale;
        const fields = resource.fields && resource.fields.length > 0 ? resource.fields : undefined;
        let projected = selectFields(resolved, fields);
        if (queryFlag(req.query.resolveUrl)) {
            const url = await resolveEntryUrl(projectId, id, resourceId, localeOne);
            projected = { ...projected, ...(url != null && { resolvedUrl: url }) };
        }
        return void (await sendContent(res, delivery.schemas.blocks, projected, {
            projectId: delivery.projectId,
            locale: delivery.choice?.locale
        }));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
}

// GET /projects/:projectId/channels/:channelId/layouts
router.get('/:channelId/layouts', async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const layoutResource = channel.resources.find(r => r.resourceType === 'layout');
        if (!layoutResource)
            return void res.status(404).json({ error: 'Channel does not expose layouts' });
        let layouts: Layout[];
        if (layoutResource.resourceId === 'layouts') {
            const ids = await listProjectKeys(projectId, layoutListPrefix());
            layouts = (
                await Promise.all(ids.map(id => getProjectJson<Layout>(projectId, layoutKey(id))))
            ).filter((l): l is Layout => l != null);
        } else {
            const layout = await getProjectJson<Layout>(
                projectId,
                layoutKey(layoutResource.resourceId)
            );
            layouts = layout ? [layout] : [];
        }
        return void (await sendContent(res, listBlocks(projectId), layouts, {
            projectId,
            locale: parseLocaleQuery(req)
        }));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/layouts/:id
router.get('/:channelId/layouts/:id', async (req: Request, res: Response) => {
    const { projectId, channelId, id } = req.params as Record<string, string>;
    if (!projectId || !channelId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const layoutResource = channel.resources.find(r => r.resourceType === 'layout');
        if (!layoutResource)
            return void res.status(404).json({ error: 'Channel does not expose layouts' });
        if (layoutResource.resourceId !== 'layouts' && layoutResource.resourceId !== id)
            return void res.status(404).json({ error: 'Layout not found in channel' });
        const layout = await getProjectJson<Layout>(projectId, layoutKey(id));
        if (!layout) return void res.status(404).json({ error: 'Layout not found' });
        return void (await sendContent(res, listBlocks(projectId), layout, {
            projectId,
            locale: parseLocaleQuery(req)
        }));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/forms
router.get('/:channelId/forms', async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const formResource = channel.resources.find(r => r.resourceType === 'form');
        if (!formResource)
            return void res.status(404).json({ error: 'Channel does not expose forms' });
        let forms: FormSchema[];
        if (formResource.resourceId === 'forms') {
            const ids = await listProjectKeys(projectId, formListPrefix());
            forms = (
                await Promise.all(ids.map(id => getProjectJson<FormSchema>(projectId, formKey(id))))
            ).filter((f): f is FormSchema => f != null);
        } else {
            const form = await getProjectJson<FormSchema>(
                projectId,
                formKey(formResource.resourceId)
            );
            forms = form ? [form] : [];
        }
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        return void res.json(
            forms.filter(f => f.status === 'active').map(f => toPublicForm(f, locale))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/forms/:id
router.get('/:channelId/forms/:id', async (req: Request, res: Response) => {
    const { projectId, channelId, id } = req.params as Record<string, string>;
    if (!projectId || !channelId || !id)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const formResource = channel.resources.find(r => r.resourceType === 'form');
        if (!formResource)
            return void res.status(404).json({ error: 'Channel does not expose forms' });
        if (formResource.resourceId !== 'forms' && formResource.resourceId !== id)
            return void res.status(404).json({ error: 'Form not found in channel' });
        const form = await getProjectJson<FormSchema>(projectId, formKey(id));
        if (!form || form.status !== 'active')
            return void res.status(404).json({ error: 'Form not found' });
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        return void res.json(toPublicForm(form, locale));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** `?locale=` selects one language for each item label. Without it, the stored locale map is returned. */
async function menuLanguage(
    projectId: string,
    req: Request
): Promise<{ locale: string; fallback: string } | undefined> {
    const locale = parseLocaleQuery(req);
    if (!locale) return undefined;
    const project = await getProjectById(projectId);
    return { locale, fallback: project?.defaultLocale || 'en' };
}

/** Returns the menu handles the channel exposes, `null` when it exposes every menu, or an empty list when it exposes none. */
function menuHandles(channel: { resources: ChannelResource[] }): string[] | null {
    const rows = channel.resources.filter(r => r.resourceType === 'menu');
    if (rows.some(r => r.resourceId === 'menus')) return null;
    return rows.map(r => r.resourceId);
}

// GET /projects/:projectId/channels/:channelId/menus
router.get('/:channelId/menus', async (req: Request, res: Response) => {
    const { projectId, channelId } = req.params as Record<string, string>;
    if (!projectId || !channelId)
        return void res.status(400).json({ error: 'Missing projectId or channelId' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const handles = menuHandles(channel);
        if (handles?.length === 0)
            return void res.status(404).json({ error: 'Channel does not expose menus' });
        const all = await listNavigations(projectId);
        const menus = handles === null ? all : all.filter(n => handles.includes(n.handle));
        const language = await menuLanguage(projectId, req);
        return void res.json(
            await Promise.all(menus.map(n => resolveNavigation(projectId, n, language)))
        );
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// GET /projects/:projectId/channels/:channelId/menus/:handle
router.get('/:channelId/menus/:handle', async (req: Request, res: Response) => {
    const { projectId, channelId, handle } = req.params as Record<string, string>;
    if (!projectId || !channelId || !handle)
        return void res.status(400).json({ error: 'Missing path parameters' });
    if (rejectIfChannelAccessForbidden(req, res, channelId)) return;
    try {
        const channel = await getChannel(projectId, channelId);
        if (!channel) return void res.status(404).json({ error: 'Channel not found' });
        const handles = menuHandles(channel);
        if (handles?.length === 0)
            return void res.status(404).json({ error: 'Channel does not expose menus' });
        if (handles !== null && !handles.includes(handle))
            return void res.status(404).json({ error: 'Menu not found in channel' });
        const nav = await getNavigationByHandle(projectId, handle);
        if (!nav) return void res.status(404).json({ error: 'Menu not found' });
        const language = await menuLanguage(projectId, req);
        return void res.json(await resolveNavigation(projectId, nav, language));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const jsonErrorBody = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/channels': {
        get: {
            summary: 'List channels (API key or JWT)',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of channels',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Channel' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a channel (JWT + project access)',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                label: { type: 'string' },
                                description: { type: 'string' },
                                resources: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ChannelResource' }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Created',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Channel' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}': {
        get: {
            summary: 'Get one channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Channel',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Channel' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        },
        patch: {
            summary: 'Update a channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            description:
                                'Only the fields sent change. `resources` replaces the whole list.',
                            properties: {
                                label: { type: 'string' },
                                description: { type: 'string' },
                                resources: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ChannelResource' }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated channel',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Channel' }
                        }
                    }
                },
                '400': { description: 'Bad request', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        },
        delete: {
            summary: 'Delete a channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
                '400': { description: 'Bad request', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/{resourceId}/entries': {
        get: {
            summary: 'List entries for a channel resource (model)',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'When set, resolves multilingual field values to this locale (falls back to project defaultLocale).'
                },
                {
                    name: 'lang',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Alias for locale.'
                },
                ...entryQueryParameters({ allowStatus: false }),
                resolveAssetsParameter(),
                resolveUrlParameter()
            ],
            responses: {
                '200': {
                    description:
                        'Entries. The X-Total-Count header holds the number of matching entries before limit/offset.',
                    headers: {
                        'X-Total-Count': { schema: { type: 'integer' } }
                    },
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Entry' }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid limit, offset or sort', ...jsonErrorBody },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/{resourceId}/entries/{id}': {
        get: {
            summary: 'Get one entry in a channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'When set, resolves multilingual field values to this locale (falls back to project defaultLocale).'
                },
                {
                    name: 'lang',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Alias for locale.'
                },
                resolveAssetsParameter(),
                resolveUrlParameter()
            ],
            responses: {
                '200': {
                    description: 'Entry',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Entry' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/settings/{modelId}': {
        get: {
            summary: 'Get the entry of a settings model',
            description:
                'A settings model has a single entry, such as site-wide contact details. This returns it the same way as getting one entry, without needing its id.',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description:
                        'When set, resolves multilingual field values to this locale (falls back to project defaultLocale).'
                },
                {
                    name: 'lang',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Alias for locale.'
                },
                resolveAssetsParameter(),
                resolveUrlParameter()
            ],
            responses: {
                '200': {
                    description: 'Entry',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Entry' }
                        }
                    }
                },
                '404': {
                    description: 'No such channel or model, or no settings saved yet',
                    ...jsonErrorBody
                }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/openapi': {
        get: {
            summary: 'OpenAPI document for this channel (frontend)',
            description:
                'Auto-generated spec: concrete paths, query params, and `entry.data` shapes for each model the channel exposes ("every model" expands to all project models). Also served at `/openapi.json`. Same auth as other channel reads.',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'OpenAPI 3 document',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/schema': {
        get: {
            summary: 'What the channel delivers, described',
            description:
                "Its models (only the fields it gives), the templates of its pages, and the blocks and structures they use: each field's type, label, description and the options that explain its value. Studio's presentation and plugins' settings are left out. `version` changes with any schema (also the `ETag`). Same auth as other channel reads.",
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'The schema',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: [
                                    'version',
                                    'projectId',
                                    'channelId',
                                    'defaultLocale',
                                    'locales',
                                    'models',
                                    'templates',
                                    'blocks',
                                    'structures'
                                ],
                                properties: {
                                    version: { type: 'string' },
                                    projectId: { type: 'string' },
                                    channelId: { type: 'string' },
                                    defaultLocale: { type: 'string' },
                                    locales: { type: 'array', items: { type: 'string' } },
                                    models: { type: 'object', additionalProperties: true },
                                    templates: { type: 'object', additionalProperties: true },
                                    blocks: { type: 'object', additionalProperties: true },
                                    structures: { type: 'object', additionalProperties: true }
                                }
                            }
                        }
                    }
                },
                '304': { description: 'Unchanged since the `If-None-Match` version' },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/types': {
        get: {
            summary: 'TypeScript types of what the channel delivers',
            description:
                "Made from the channel's schema: one file with a type for each model, template, block and structure, and `MoteurSchema` for a typed client. What `moteur types --channel` writes.",
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'The types',
                    content: { 'text/plain': { schema: { type: 'string' } } }
                },
                '304': { description: 'Unchanged since the `If-None-Match` version' },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/pages': {
        get: {
            summary: 'List pages in a channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Pages',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/CollectionPageNode' }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/pages/{id}': {
        get: {
            summary: 'Get one page by id',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Page',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CollectionPageNode' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/pages/by-slug/{slug}': {
        get: {
            summary: 'Get one page by slug',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        "Match the page's slug in this language (a page without one answers to its default slug). Without it, a slug in any language matches."
                }
            ],
            responses: {
                '200': {
                    description: 'Page',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/CollectionPageNode' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/layouts': {
        get: {
            summary: 'List layouts exposed by the channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Layouts',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/layouts/{id}': {
        get: {
            summary: 'Get one layout by id',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Layout',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/forms': {
        get: {
            summary: 'List forms exposed by the channel',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Every label, hint, choice and message in this language (fr-CA reads fr). Absent: each is as written, one text or one per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Forms',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/FormSchemaDoc' }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/forms/{id}': {
        get: {
            summary: 'Get one form by id',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Every label, hint, choice and message in this language (fr-CA reads fr). Absent: each is as written, one text or one per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Form',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/FormSchemaDoc' }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/menus': {
        get: {
            summary: 'List menus exposed by the channel, with item URLs resolved',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Return each item label in this language. Falls back to the project default. Omit to keep one value per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Menus',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { type: 'object', additionalProperties: true }
                            }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    },
    '/projects/{projectId}/channels/{channelId}/menus/{handle}': {
        get: {
            summary: 'Get one menu by handle, with item URLs resolved',
            tags: ['Public API — Channels'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'channelId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'handle', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description:
                        'Return each item label in this language. Falls back to the project default. Omit to keep one value per language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Menu',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Not found', ...jsonErrorBody }
            }
        }
    }
};

export default router;
