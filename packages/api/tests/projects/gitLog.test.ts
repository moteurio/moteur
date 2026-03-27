import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

const mockIsGitRepo = vi.fn();
const mockGetRepoLog = vi.fn();
const mockGetLog = vi.fn();
const mockProjectDir = vi.fn();

vi.mock('@moteurio/core/utils/pathUtils.js', () => ({
    projectDir: (id: string) => mockProjectDir(id)
}));

vi.mock('@moteurio/core/git/index.js', () => ({
    isGitRepo: (dir: string) => mockIsGitRepo(dir),
    getRepoLog: (dir: string, max: number) => mockGetRepoLog(dir, max),
    getLog: (dir: string, path: string, max: number) => mockGetLog(dir, path, max)
}));

import gitLogRoute from '../../src/projects/gitLog';

const app = express();
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
});
