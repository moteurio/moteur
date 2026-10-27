import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import {
    resolveAllUrls,
    resolveBreadcrumb,
    getNavigation,
    resolvePath
} from '@moteurio/core/pages.js';
import { getProjectById } from '@moteurio/core/projects.js';
import {
    listRedirects,
    createRedirect,
    updateRedirect,
    deleteRedirect
} from '@moteurio/core/redirects.js';
import {
    optionalAuth,
    apiKeyAuth,
    requireCollectionOrProjectAccess,
    requireProjectAccess,
    denyIfApiKeySiteWideBlocked
} from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const pageOutputAuth = [optionalAuth, apiKeyAuth, requireCollectionOrProjectAccess];

type ProjectParams = { projectId: string };
type NavigationQuery = { depth?: string; rootId?: string; locale?: string };
type BreadcrumbQuery = { pageId?: string; entryId?: string; locale?: string };

/** `?locale=` (or `?lang=`) as one string, if given. */
function localeQuery(req: Request): string | undefined {
    const raw = req.query.locale ?? req.query.lang;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

router.get('/sitemap.xml', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    if (denyIfApiKeySiteWideBlocked(req, res)) return;
    try {
        const project = await getProjectById(projectId);
        const siteUrl = project?.siteUrl?.replace(/\/$/, '') ?? '';
        const all = await resolveAllUrls(projectId);
        const urls = all.filter(r => r.sitemapInclude);

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        const loc = (path: string) => (siteUrl ? `${siteUrl}${path}` : path);
        const defaultLocale = project?.defaultLocale;
        // Each address lists itself and its other languages, and x-default for the default one.
        const alternates = (u: (typeof urls)[number]): string => {
            const links = Object.entries(u.alternates ?? {});
            if (links.length < 2) return '';
            const def = defaultLocale ? u.alternates?.[defaultLocale] : undefined;
            return [
                ...links.map(([hreflang, href]) => [hreflang, href] as const),
                ...(def ? [['x-default', def] as const] : [])
            ]
                .map(
                    ([hreflang, href]) =>
                        `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(loc(href))}"/>`
                )
                .join('');
        };
        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
            ...urls.map(
                u =>
                    `<url><loc>${escapeXml(loc(u.url))}</loc>` +
                    alternates(u) +
                    (u.sitemapPriority !== undefined
                        ? `<priority>${u.sitemapPriority}</priority>`
                        : '') +
                    (u.sitemapChangefreq ? `<changefreq>${u.sitemapChangefreq}</changefreq>` : '') +
                    '</url>'
            ),
            '</urlset>'
        ].join('\n');
        return void res.send(xml);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/sitemap.json', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    if (denyIfApiKeySiteWideBlocked(req, res)) return;
    try {
        const all = await resolveAllUrls(projectId);
        const locale = localeQuery(req);
        const urls = all.filter(r => r.sitemapInclude && (!locale || r.locale === locale));
        return void res.json(urls);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/navigation',
    ...pageOutputAuth,
    async (req: Request<ProjectParams, unknown, unknown, NavigationQuery>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        const depth = req.query.depth != null ? Number(req.query.depth) : undefined;
        const rootId = req.query.rootId;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        if (denyIfApiKeySiteWideBlocked(req, res)) return;
        try {
            const tree = await getNavigation(projectId, {
                depth,
                rootId: rootId === '' || rootId === 'null' ? null : rootId,
                locale: localeQuery(req)
            });
            return void res.json(tree);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get('/urls', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    if (denyIfApiKeySiteWideBlocked(req, res)) return;
    try {
        const locale = localeQuery(req);
        const urls = (await resolveAllUrls(projectId)).filter(r => !locale || r.locale === locale);
        return void res.json(urls);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/breadcrumb',
    ...pageOutputAuth,
    async (req: Request<ProjectParams, unknown, unknown, BreadcrumbQuery>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        const { pageId, entryId } = req.query;
        if (!projectId || !pageId)
            return void res.status(400).json({ error: 'Missing projectId or pageId' });
        if (denyIfApiKeySiteWideBlocked(req, res)) return;
        try {
            const result = await resolveBreadcrumb(projectId, pageId, entryId, localeQuery(req));
            return void res.json(result);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get('/resolve', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    if (!projectId || !path)
        return void res.status(400).json({ error: 'Missing projectId or path' });
    if (denyIfApiKeySiteWideBlocked(req, res)) return;
    try {
        const found = await resolvePath(projectId, path);
        if (!found) return void res.status(404).json({ error: 'Nothing lives at this path' });
        return void res.json(found);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/redirects', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    if (denyIfApiKeySiteWideBlocked(req, res)) return;
    try {
        return void res.json(await listRedirects(projectId));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/redirects', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        return void res.status(201).json(await createRedirect(projectId, req.user!, req.body));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/redirects/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        return void res.json(await updateRedirect(projectId, req.user!, id, req.body ?? {}));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/redirects/:id', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteRedirect(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const pageOutputSecurity: OpenAPIV3.SecurityRequirementObject[] = [
    { bearerAuth: [] },
    { apiKeyAuth: [] }
];

const idParam: OpenAPIV3.ParameterObject = {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const projectParam: OpenAPIV3.ParameterObject = {
    name: 'projectId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const redirectBody: OpenAPIV3.RequestBodyObject = {
    content: {
        'application/json': {
            schema: {
                type: 'object',
                properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    status: { type: 'integer', enum: [301, 302] },
                    note: { type: 'string' }
                }
            }
        }
    }
};
const redirectJson = {
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Redirect' } } }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/resolve': {
        get: {
            summary: 'What lives at a path: a page or entry, or a redirect',
            tags: ['Page outputs'],
            description:
                'For a site\'s catch-all route. `match: "page"` gives the page (and entry), its language and its address in the others; `match: "redirect"` gives where to send the visitor. A live page wins over a redirect from its address. Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                projectParam,
                {
                    name: 'path',
                    in: 'query',
                    required: true,
                    schema: { type: 'string' },
                    description: 'The path on the site, e.g. /fr/a-propos.'
                }
            ],
            responses: {
                '200': {
                    description: 'A page or a redirect',
                    content: {
                        'application/json': {
                            schema: { type: 'object', additionalProperties: true }
                        }
                    }
                },
                '404': { description: 'Nothing lives at this path' }
            }
        }
    },
    '/projects/{projectId}/redirects': {
        get: {
            summary: 'List redirects',
            tags: ['Page outputs'],
            description:
                'Old addresses and where they go, for the site or its host to apply. Moteur adds one when a live page or entry changes address. Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [projectParam],
            responses: {
                '200': {
                    description: 'Redirects',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/Redirect' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Create a redirect',
            tags: ['Page outputs'],
            description:
                'A redirect to another redirect points at the end of the chain. Refused: a loop, a second redirect from one address, and the address of a live page.',
            parameters: [projectParam],
            requestBody: redirectBody,
            responses: {
                '201': { description: 'Created', ...redirectJson },
                '400': { description: 'Not a path, or a loop' },
                '409': { description: 'The address is taken' }
            }
        }
    },
    '/projects/{projectId}/redirects/{id}': {
        patch: {
            summary: 'Update a redirect',
            tags: ['Page outputs'],
            parameters: [projectParam, idParam],
            requestBody: redirectBody,
            responses: {
                '200': { description: 'Updated', ...redirectJson },
                '404': { description: 'Not found' }
            }
        },
        delete: {
            summary: 'Delete a redirect',
            tags: ['Page outputs'],
            parameters: [projectParam, idParam],
            responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } }
        }
    },
    '/projects/{projectId}/sitemap.xml': {
        get: {
            summary: 'Get sitemap as XML',
            tags: ['Page outputs'],
            description:
                'Every address in every language, each with hreflang alternates (and x-default). Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'XML sitemap',
                    content: {
                        'application/xml': {
                            schema: { type: 'string' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/sitemap.json': {
        get: {
            summary: 'Get sitemap as JSON (ResolvedUrl[] where sitemapInclude)',
            tags: ['Page outputs'],
            description: 'Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'Only the addresses in this language.'
                }
            ],
            responses: {
                '200': {
                    description: 'JSON array of resolved URLs',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/ResolvedUrlEntry' }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/navigation': {
        get: {
            summary: 'Get navigation tree',
            tags: ['Page outputs'],
            description: 'Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'depth', in: 'query', schema: { type: 'number' } },
                { name: 'rootId', in: 'query', schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'Addresses in this language (default: the project default).'
                }
            ],
            responses: {
                '200': {
                    description: 'Navigation tree',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/NavigationTree' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/urls': {
        get: {
            summary: 'Get all resolved URLs',
            tags: ['Page outputs'],
            description:
                'One address per page or entry and language, each with `locale` and its `alternates`. Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'Only the addresses in this language.'
                }
            ],
            responses: {
                '200': {
                    description: 'Resolved URLs',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/ResolvedUrlEntry' }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/breadcrumb': {
        get: {
            summary: 'Get breadcrumb for a page (and optional entry)',
            tags: ['Page outputs'],
            description: 'Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'pageId', in: 'query', required: true, schema: { type: 'string' } },
                { name: 'entryId', in: 'query', schema: { type: 'string' } },
                {
                    name: 'locale',
                    in: 'query',
                    schema: { type: 'string' },
                    description: 'Addresses in this language (default: the project default).'
                }
            ],
            responses: {
                '200': {
                    description: 'Canonical URL and breadcrumb trail',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/BreadcrumbPayload' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
