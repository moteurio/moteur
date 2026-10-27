import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import { URL } from 'url';
import { projectDir } from '@moteurio/core/utils/pathUtils.js';
import { getLog, getRepoLog, gitStatus, isGitRepo, push } from '@moteurio/core/git/index.js';
import { gitTokenInfo, removeGitToken, setGitToken } from '@moteurio/core/gitCredentials.js';
import { requireProjectAccess, requireProjectAdmin } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** A remote's address without any password or token Git may have been given. */
function withoutCredentials(url: string | null): string | null {
    if (!url) return url;
    try {
        const u = new URL(url);
        u.username = '';
        u.password = '';
        return u.toString();
    } catch {
        return url;
    }
}

function statusOf(projectId: string) {
    const status = gitStatus(projectDir(projectId));
    return {
        ...status,
        remoteUrl: withoutCredentials(status.remoteUrl),
        token: gitTokenInfo(projectId)
    };
}

/** Where the history stands: branch, last commit, and how many commits the remote lacks. */
router.get('/status', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        if (!isGitRepo(projectDir(projectId)))
            return void res.json({
                branch: null,
                remoteUrl: null,
                lastCommit: null,
                unpushed: null,
                token: gitTokenInfo(projectId)
            });
        return void res.json(statusOf(projectId));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** Push now (admins): after fixing the remote's access, without waiting for the next save. */
router.post('/push', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        const dir = projectDir(projectId);
        if (!isGitRepo(dir))
            return void res.status(400).json({ error: 'Project is not a Git repository' });
        if (!gitStatus(dir).remoteUrl)
            return void res
                .status(400)
                .json({ error: 'The project has no Git address to push to' });
        const pushed = push(dir);
        return void res.json({ pushed, ...statusOf(projectId) });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** The token pushes use (admins): kept encrypted outside Git, never sent back. */
router.put('/token', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(setGitToken(projectId, req.user!, req.body ?? {}));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/token', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(removeGitToken(projectId, req.user!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

/** Query: path (optional, relative to project root), max (default 50, max 200). */
router.get('/log', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
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
    '/projects/{projectId}/git/status': {
        get: {
            summary: 'Where the content history stands',
            description:
                'The branch, the last commit, the Git address (without any credentials), and how many commits that address lacks. A number that keeps growing means pushes fail.',
            tags: ['Git'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Status',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    branch: { type: 'string', nullable: true },
                                    remoteUrl: { type: 'string', nullable: true },
                                    lastCommit: {
                                        type: 'object',
                                        nullable: true,
                                        additionalProperties: true
                                    },
                                    token: {
                                        type: 'object',
                                        description:
                                            '`{ hasToken, username?, setAt? }`: never the token itself.'
                                    },
                                    unpushed: {
                                        type: 'integer',
                                        nullable: true,
                                        description:
                                            'Commits the remote lacks: 0 when all are there, null without a remote.'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/git/token': {
        put: {
            summary: 'Set the token pushes use (admins)',
            description:
                'For a private repository: a token with write access to it (GitHub: a fine-grained token with Contents read and write; GitLab: a project access token). Kept encrypted with MOTEUR_ENCRYPTION_KEY in the gitignored workspace, sent to Git only as a header during a push, and never returned. `username` is optional (default `x-access-token`; Bitbucket needs `x-token-auth` or the account name).',
            tags: ['Git'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['token'],
                            properties: { token: { type: 'string' }, username: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': { description: '`{ hasToken, username?, setAt }`' },
                '400': { description: 'Not a usable token' },
                '403': { description: 'Not an admin' }
            }
        },
        delete: {
            summary: 'Remove the token (admins)',
            tags: ['Git'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: { '200': { description: '`{ hasToken: false }`' } }
        }
    },
    '/projects/{projectId}/git/push': {
        post: {
            summary: 'Push the content history now (admins)',
            description:
                'Pushes to the project’s Git address, as every save does, and answers `pushed` with the status after.',
            tags: ['Git'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': { description: '`pushed` (true or false) and the status' },
                '400': { description: 'Not a Git repository, or no Git address' }
            }
        }
    },
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
