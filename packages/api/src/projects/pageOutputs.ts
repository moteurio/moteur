import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { resolveAllUrls, resolveBreadcrumb, getNavigation } from '@moteurio/core/pages.js';
import { getProjectById } from '@moteurio/core/projects.js';
import { optionalAuth, apiKeyAuth, requireCollectionOrProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const pageOutputAuth = [optionalAuth, apiKeyAuth, requireCollectionOrProjectAccess];

type ProjectParams = { projectId: string };
type NavigationQuery = { depth?: string; rootId?: string };
type BreadcrumbQuery = { pageId?: string; entryId?: string };

router.get('/sitemap.xml', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const project = await getProjectById(projectId);
        const siteUrl = project?.siteUrl?.replace(/\/$/, '') ?? '';
        const all = await resolveAllUrls(projectId);
        const urls = all.filter(r => r.sitemapInclude);

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        const loc = (path: string) => (siteUrl ? `${siteUrl}${path}` : path);
        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            ...urls.map(
                u =>
                    `<url><loc>${escapeXml(loc(u.url))}</loc>` +
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
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const all = await resolveAllUrls(projectId);
        const urls = all.filter(r => r.sitemapInclude);
        return void res.json(urls);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/navigation',
    ...pageOutputAuth,
    async (req: Request<ProjectParams, unknown, unknown, NavigationQuery>, res: Response) => {
        const { projectId } = req.params;
        const depth = req.query.depth != null ? Number(req.query.depth) : undefined;
        const rootId = req.query.rootId;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        try {
            const tree = await getNavigation(projectId, {
                depth,
                rootId: rootId === '' || rootId === 'null' ? null : rootId
            });
            return void res.json(tree);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get('/urls', ...pageOutputAuth, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const urls = await resolveAllUrls(projectId);
        return void res.json(urls);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get(
    '/breadcrumb',
    ...pageOutputAuth,
    async (req: Request<ProjectParams, unknown, unknown, BreadcrumbQuery>, res: Response) => {
        const { projectId } = req.params;
        const { pageId, entryId } = req.query;
        if (!projectId || !pageId)
            return void res.status(400).json({ error: 'Missing projectId or pageId' });
        try {
            const result = await resolveBreadcrumb(projectId, pageId, entryId);
            return void res.json(result);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

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

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/sitemap.xml': {
        get: {
            summary: 'Get sitemap as XML',
            tags: ['Page outputs'],
            description: 'Requires project API key or JWT.',
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
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
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
                { name: 'rootId', in: 'query', schema: { type: 'string' } }
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
            description: 'Requires project API key or JWT.',
            security: pageOutputSecurity,
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
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
                { name: 'entryId', in: 'query', schema: { type: 'string' } }
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
