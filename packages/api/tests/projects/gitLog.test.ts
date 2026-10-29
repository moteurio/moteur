import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireProjectAdmin: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireBuilder: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireContentLead: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireDeveloper: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

const mockIsGitRepo = vi.fn();
const mockGetRepoLog = vi.fn();
const mockGetLog = vi.fn();
const mockProjectDir = vi.fn();
const mockGitStatus = vi.fn();
const mockPush = vi.fn();

vi.mock('@moteurio/core/utils/pathUtils.js', () => ({
    projectDir: (id: string) => mockProjectDir(id)
}));

vi.mock('@moteurio/core/git/index.js', () => ({
    isGitRepo: (dir: string) => mockIsGitRepo(dir),
    getRepoLog: (dir: string, max: number) => mockGetRepoLog(dir, max),
    getLog: (dir: string, path: string, max: number) => mockGetLog(dir, path, max),
    gitStatus: (dir: string) => mockGitStatus(dir),
    push: (dir: string) => mockPush(dir)
}));

const mockSetToken = vi.fn();
vi.mock('@moteurio/core/gitCredentials.js', () => ({
    gitTokenInfo: () => ({ hasToken: true, setAt: '2026-10-26T00:00:00.000Z' }),
    setGitToken: (...args: unknown[]) => mockSetToken(...args),
    removeGitToken: () => ({ hasToken: false })
}));

import gitLogRoute from '../../src/projects/gitLog';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/git', gitLogRoute);

describe('GET /projects/:projectId/git/log', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectDir.mockReturnValue('/proj/demo');
        mockIsGitRepo.mockReturnValue(true);
        mockGetRepoLog.mockReturnValue([
            {
                hash: 'deadbeef',
                message: 'Test',
                authorName: 'Dev',
                authorEmail: 'd@d.com',
                date: '2025-01-01T00:00:00.000Z'
            }
        ]);
    });

    it('returns repo log when path is omitted', async () => {
        const res = await request(app).get('/projects/demo/git/log');
        expect(res.status).toBe(200);
        expect(res.body.commits).toHaveLength(1);
        expect(mockGetRepoLog).toHaveBeenCalledWith('/proj/demo', 50);
        expect(mockGetLog).not.toHaveBeenCalled();
    });

    it('passes max capped at 200', async () => {
        await request(app).get('/projects/demo/git/log?max=500');
        expect(mockGetRepoLog).toHaveBeenCalledWith('/proj/demo', 200);
    });

    it('uses getLog when path query is set', async () => {
        mockGetLog.mockReturnValue([]);
        const res = await request(app).get('/projects/demo/git/log?path=models%2Ffoo.json');
        expect(res.status).toBe(200);
        expect(mockGetLog).toHaveBeenCalledWith('/proj/demo', 'models/foo.json', 50);
        expect(mockGetRepoLog).not.toHaveBeenCalled();
    });

    it('returns 400 when not a git repo', async () => {
        mockIsGitRepo.mockReturnValue(false);
        const res = await request(app).get('/projects/demo/git/log');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Project is not a Git repository' });
    });

    it('returns 400 when path escapes the project directory', async () => {
        const res = await request(app).get(
            '/projects/demo/git/log?path=' + encodeURIComponent('../../etc/passwd')
        );
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Path escapes project directory' });
        expect(mockGetLog).not.toHaveBeenCalled();
    });

    it('returns 400 when path is absolute', async () => {
        const res = await request(app).get(
            '/projects/demo/git/log?path=' + encodeURIComponent('/etc/passwd')
        );
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Path must be relative to the project root' });
        expect(mockGetLog).not.toHaveBeenCalled();
    });
});

describe('the Git address: status and push', () => {
    const status = {
        branch: 'main',
        remoteUrl: 'https://x-access-token:secret@github.com/a/b.git',
        lastCommit: { hash: 'deadbeef', message: 'Save', date: '2026-10-26T00:00:00.000Z' },
        unpushed: 2
    };
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectDir.mockReturnValue('/proj/demo');
        mockIsGitRepo.mockReturnValue(true);
        mockGitStatus.mockReturnValue(status);
    });

    it('says what the address lacks, never showing a token Git was given', async () => {
        const res = await request(app).get('/projects/demo/git/status');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ branch: 'main', unpushed: 2 });
        expect(res.body.remoteUrl).toBe('https://github.com/a/b.git');
    });

    it('pushes now and answers whether it worked', async () => {
        mockPush.mockReturnValue(false);
        const res = await request(app).post('/projects/demo/git/push');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ pushed: false, unpushed: 2 });
        expect(mockPush).toHaveBeenCalledWith('/proj/demo');
    });

    it('refuses to push without an address', async () => {
        mockGitStatus.mockReturnValue({ ...status, remoteUrl: null, unpushed: null });
        const res = await request(app).post('/projects/demo/git/push');
        expect(res.status).toBe(400);
        expect(mockPush).not.toHaveBeenCalled();
    });
});

describe('the token pushes use', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectDir.mockReturnValue('/proj/demo');
        mockIsGitRepo.mockReturnValue(true);
        mockGitStatus.mockReturnValue({
            branch: 'main',
            remoteUrl: null,
            lastCommit: null,
            unpushed: null
        });
    });

    it('is set by an admin and only said to exist, never sent back', async () => {
        mockSetToken.mockReturnValue({ hasToken: true, setAt: 'now' });
        const res = await request(app)
            .put('/projects/demo/git/token')
            .send({ token: 'ghp_secret123', username: 'oauth2' });
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain('ghp_secret123');
        expect(mockSetToken).toHaveBeenCalledWith('demo', expect.anything(), {
            token: 'ghp_secret123',
            username: 'oauth2'
        });
        const status = await request(app).get('/projects/demo/git/status');
        expect(status.body.token).toEqual({ hasToken: true, setAt: '2026-10-26T00:00:00.000Z' });
        const removed = await request(app).delete('/projects/demo/git/token');
        expect(removed.body).toEqual({ hasToken: false });
    });

    it('answers a refused token with its reason', async () => {
        mockSetToken.mockImplementation(() => {
            throw Object.assign(new Error('The token must be 8 to 500 characters'), {
                statusCode: 400
            });
        });
        const res = await request(app).put('/projects/demo/git/token').send({ token: 'x' });
        expect(res.status).toBe(400);
    });
});
