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
import { getContentIndex } from '@moteurio/core/contentIndex/index.js';
import { requireProjectAccess } from '../../middlewares/auth.js';
import { requireDeveloper } from '../../middlewares/auth.js';
import { needsApproval } from '@moteurio/types';
import type { NextFunction } from 'express';
import { sendApiError } from '../../utils/apiError.js';
import { log, toActivityEvent } from '@moteurio/core/activityLogger.js';
import { withProjectWriteLock } from '@moteurio/core/utils/projectWriteLock.js';

const router: Router = Router({ mergeParams: true });

// A shared branch can change live content outside the per-entry review workflow.
function requireBranchWrite(req: Request, res: Response, next: NextFunction) {
    requireDeveloper(req, res, () => {
        if (needsApproval(req.user, req.project)) {
            return void res
                .status(403)
                .json({ error: 'Branch changes require unrestricted publishing access' });
        }
        next();
    });
}

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
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

router.post('/', requireBranchWrite, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
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
        await withProjectWriteLock(projectId, async () => {
            createBranch(dir, name, from);
        });
        return void res.status(201).json({ branch: name, from });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/switch', requireBranchWrite, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const branch = req.body?.branch as string | undefined;
    if (!branch || typeof branch !== 'string') {
        return void res.status(400).json({ error: 'Body "branch" is required' });
    }
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    try {
        await withProjectWriteLock(projectId, async () => {
            checkoutBranch(dir, branch);
            (await getContentIndex()).invalidate(projectId);
        });
        if (!(await push(dir))) {
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

router.post('/merge', requireBranchWrite, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
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
        await withProjectWriteLock(projectId, async () => {
            mergeBranch(dir, sourceBranch, author);
            (await getContentIndex()).invalidate(projectId);
        });
        if (!(await push(dir))) {
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
