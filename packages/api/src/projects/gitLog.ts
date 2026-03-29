import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import { projectDir } from '@moteurio/core/utils/pathUtils.js';
import { getLog, getRepoLog, isGitRepo } from '@moteurio/core/git/index.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** Query: path (optional, relative to project root), max (default 50, max 200). */
router.get('/log', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const dir = projectDir(projectId);
    if (!isGitRepo(dir)) {
        return void res.status(400).json({ error: 'Project is not a Git repository' });
    }
    const rawMax = req.query.max;
    let max = 50;
    if (typeof rawMax === 'string' && rawMax.trim()) {
        const n = parseInt(rawMax, 10);
        if (!Number.isNaN(n) && n > 0) max = Math.min(n, 200);
    }
    const relPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    try {
        let commits;
        if (relPath) {
            const withSlashes = relPath.replace(/\\/g, '/');
            if (path.isAbsolute(withSlashes)) {
                return void res
                    .status(400)
                    .json({ error: 'Path must be relative to the project root' });
            }
            const root = path.resolve(dir);
            const resolved = path.resolve(dir, withSlashes);
            const underRoot = path.relative(root, resolved);
            if (underRoot.startsWith('..') || path.isAbsolute(underRoot)) {
                return void res.status(400).json({ error: 'Path escapes project directory' });
            }
            commits = getLog(dir, underRoot.replace(/\\/g, '/'), max);
        } else {
            commits = getRepoLog(dir, max);
        }
        return void res.json({ commits });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/git/log': {
        get: {
            summary: 'Read-only Git commit history for the content repository',
            description:
                'Returns commits on the current branch. Omit `path` for full-repo history; set `path` to a project-relative file path for file-specific history. Failed commits are not listed (see activity log for git_commit_failed / git_push_failed).',
            tags: ['Git'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                {
                    name: 'path',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                    description: 'Optional path relative to project root (forward slashes).'
                },
                {
                    name: 'max',
                    in: 'query',
                    required: false,
                    schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
                }
            ],
            responses: {
                '200': {
                    description: 'Commit list (newest first in array order from git log)',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    commits: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                hash: { type: 'string' },
                                                message: { type: 'string' },
                                                authorName: { type: 'string' },
                                                authorEmail: { type: 'string' },
                                                date: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description:
                        'Not a Git repository, or `path` is absolute or resolves outside the project root'
                }
            }
        }
    }
};

export default router;
