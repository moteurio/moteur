import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { projectDir } from '@moteurio/core/utils/pathUtils.js';
import {
    listBranches,
    createBranch,
    checkoutBranch,
    mergeBranch,
    getCurrentBranch,
    isGitRepo,
    push
} from '@moteurio/core/git/index.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { sendApiError } from '../../utils/apiError.js';
import { log, toActivityEvent } from '@moteurio/core/activityLogger.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    try {
        const branches = listBranches(dir, true);
        const current = getCurrentBranch(dir);
        return void res.json({ branches, current: current ?? undefined });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const name = req.body?.name as string | undefined;
    const from = (req.body?.from as string) ?? 'HEAD';
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9/_.-]+$/.test(name)) {
        return void res.status(400).json({
            error: 'Branch name is required and must be valid (alphanumeric, /, _, ., -)'
        });
    }
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    try {
        createBranch(dir, name, from);
        return void res.status(201).json({ branch: name, from });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/switch', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const branch = req.body?.branch as string | undefined;
    if (!branch || typeof branch !== 'string') {
        return void res.status(400).json({ error: 'Body "branch" is required' });
    }
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    try {
        checkoutBranch(dir, branch);
        if (!push(dir)) {
            log(
                toActivityEvent(projectId, 'git', 'repo', 'git_push_failed', req.user, undefined, {
                    context: 'branch_switch',
                    branch
                })
            );
        }
        return void res.json({ branch });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/merge', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const sourceBranch = req.body?.sourceBranch as string | undefined;
    if (!sourceBranch || typeof sourceBranch !== 'string') {
        return void res.status(400).json({ error: 'Body "sourceBranch" is required' });
    }
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    const user = req.user;
    const author = user ? { name: user.name, email: user.email, id: user.id } : undefined;
    try {
        mergeBranch(dir, sourceBranch, author);
        if (!push(dir)) {
            log(
                toActivityEvent(projectId, 'git', 'repo', 'git_push_failed', req.user, undefined, {
                    context: 'branch_merge',
                    sourceBranch
                })
            );
        }
        return void res.json({ merged: sourceBranch });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/branches': {
        get: {
            summary: 'List content branches',
            tags: ['Branches'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of branch names and current branch',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    branches: { type: 'array', items: { type: 'string' } },
                                    current: { type: 'string', nullable: true }
                                }
                            }
                        }
                    }
                },
                '400': { description: 'Not a Git repository' }
            }
        },
        post: {
            summary: 'Create a new branch',
            tags: ['Branches'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['name'],
                            properties: {
                                name: { type: 'string', description: 'New branch name' },
                                from: {
                                    type: 'string',
                                    description: 'Ref to branch from (default HEAD)'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Branch created',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { branch: { type: 'string' }, from: { type: 'string' } }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid name or not a Git repository' }
            }
        }
    },
    '/projects/{projectId}/branches/switch': {
        post: {
            summary: 'Switch current branch',
            tags: ['Branches'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['branch'],
                            properties: { branch: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Switched branch',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { branch: { type: 'string' } }
                            }
                        }
                    }
                },
                '400': { description: 'Invalid or failed to switch' }
            }
        }
    },
    '/projects/{projectId}/branches/merge': {
        post: {
            summary: 'Merge a branch into current branch',
            tags: ['Branches'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['sourceBranch'],
                            properties: { sourceBranch: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Merge completed',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { merged: { type: 'string' } }
                            }
                        }
                    }
                },
                '400': { description: 'Merge failed (e.g. conflicts or uncommitted changes)' }
            }
        }
    }
};

export default router;
