/* global setTimeout, clearTimeout */
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { ImportBundle, ImportJob } from '@moteurio/types/Import.js';
import {
    approveImport,
    getImport,
    listImports,
    startImport
} from '@moteurio/core/imports/importJobs.js';
import { exportBundle } from '@moteurio/core/imports/exportBundle.js';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { queryFlag } from '../utils/queryFlag.js';
import { sendApiError } from '../utils/apiError.js';

// Imports and exports touch the whole project, schemas included: its admins'.
const router: Router = Router({ mergeParams: true });

/** How long a request waits for its import before answering 202 with the job to follow. */
function waitOf(req: Request): number {
    const asked = Number(req.query.wait);
    return Number.isFinite(asked) ? Math.min(Math.max(asked, 0), 60) * 1000 : 20_000;
}

router.post('/imports', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        const { job, finished } = await startImport(
            req.user!,
            projectId!,
            req.body as ImportBundle,
            { dryRun: queryFlag(req.query.dryRun) }
        );
        const late = Symbol('late');
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = await Promise.race([
            finished,
            new Promise<typeof late>(resolve => {
                timer = setTimeout(() => resolve(late), waitOf(req));
            })
        ]);
        clearTimeout(timer);
        if (done === late) return void res.status(202).json(job);
        return void res.status((done as ImportJob).status === 'failed' ? 422 : 200).json(done);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/imports', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await listImports(projectId!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/imports/:id', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    try {
        const job = await getImport(projectId!, id!);
        if (!job) return void res.status(404).json({ error: 'No such import' });
        return void res.json(job);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/imports/:id/approve', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
    try {
        return void res.json(await approveImport(req.user!, projectId!, id!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.get('/export', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        res.setHeader('Cache-Control', 'no-store');
        return void res.json(await exportBundle(req.user!, projectId!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const P = {
    name: 'projectId',
    in: 'path' as const,
    required: true,
    schema: { type: 'string' as const }
};
const ID = { name: 'id', in: 'path' as const, required: true, schema: { type: 'string' as const } };
const job = (description: string): OpenAPIV3.ResponseObject => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportJob' } } }
});

export const schemas: Record<string, OpenAPIV3.SchemaObject> = {
    ImportJob: {
        type: 'object',
        required: ['id', 'status', 'dryRun', 'progress', 'items', 'issues'],
        properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['running', 'done', 'failed', 'awaiting_approval'] },
            dryRun: { type: 'boolean' },
            progress: {
                type: 'object',
                properties: { done: { type: 'integer' }, total: { type: 'integer' } }
            },
            items: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        kind: { type: 'string' },
                        id: { type: 'string' },
                        action: { type: 'string', enum: ['create', 'update', 'skip'] }
                    }
                }
            },
            issues: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } }
                }
            },
            commit: { type: 'string' },
            toPublish: { type: 'object', additionalProperties: true },
            createdAt: { type: 'string' },
            finishedAt: { type: 'string' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/imports': {
        post: {
            summary: 'Import a bundle: all of it, or nothing',
            description:
                'Saves the bundle’s structures, blocks, models, templates, files, pages, entries, menus and redirects in one commit; any failure undoes everything. `{ "$ref": "page:<ref>" }` (or `entry:<model>/<ref>`, `asset:<ref>`) anywhere stands for an id. With `publish`, pages and entries go live, or wait for a person’s approval after an agent. Answers when done (200, or 422 if it failed), or after `wait` seconds with the job to follow (202).',
            tags: ['Imports'],
            parameters: [
                P,
                {
                    name: 'dryRun',
                    in: 'query',
                    description: 'Check everything as if saving, then keep nothing.',
                    schema: { type: 'boolean' }
                },
                {
                    name: 'wait',
                    in: 'query',
                    description: 'Seconds to wait for the end (0–60, default 20).',
                    schema: { type: 'integer', minimum: 0, maximum: 60 }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['version'],
                            additionalProperties: true,
                            properties: {
                                version: { type: 'integer', enum: [1] },
                                existing: { type: 'string', enum: ['update', 'skip', 'fail'] },
                                publish: { type: 'boolean' },
                                structures: { type: 'array', items: { type: 'object' } },
                                blocks: { type: 'array', items: { type: 'object' } },
                                models: { type: 'array', items: { type: 'object' } },
                                templates: { type: 'array', items: { type: 'object' } },
                                assets: { type: 'array', items: { type: 'object' } },
                                pages: { type: 'array', items: { type: 'object' } },
                                entries: { type: 'object', additionalProperties: true },
                                menus: { type: 'array', items: { type: 'object' } },
                                redirects: { type: 'array', items: { type: 'object' } }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': job('Saved (or, in a dry run, checked)'),
                '202': job('Still running: follow it with GET /imports/{id}'),
                '422': job('Nothing was kept: see issues')
            }
        },
        get: {
            summary: 'Recent imports',
            tags: ['Imports'],
            parameters: [P],
            responses: {
                '200': {
                    description: 'Newest first',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/ImportJob' }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/imports/{id}': {
        get: {
            summary: 'An import and how far it has come',
            tags: ['Imports'],
            parameters: [P, ID],
            responses: { '200': job('The import'), '404': { description: 'No such import' } }
        }
    },
    '/projects/{projectId}/imports/{id}/approve': {
        post: {
            summary: 'Put a waiting import live',
            description:
                'Publishes the pages and entries of an import that waits for approval. A person who can publish does it, never an agent.',
            tags: ['Imports'],
            parameters: [P, ID],
            responses: {
                '200': job('Published'),
                '403': { description: 'Not someone who can approve' },
                '409': { description: 'Not waiting for approval' }
            }
        }
    },
    '/projects/{projectId}/export': {
        get: {
            summary: 'The project as an import bundle',
            description:
                'Its own structures and blocks, models, templates, files (by address), pages, entries, menus and redirects people made. Imported into another project, it makes the same one.',
            tags: ['Imports'],
            parameters: [P],
            responses: {
                '200': {
                    description: 'The bundle',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                description: 'An import bundle (see POST /imports)'
                            }
                        }
                    }
                }
            }
        }
    }
};

export default router;
