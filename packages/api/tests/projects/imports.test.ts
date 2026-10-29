import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAdmin: (req: any, _res: any, next: any) => {
        req.user = { id: 'u1', roles: ['admin'] };
        next();
    },
    requireBuilder: (req: any, _res: any, next: any) => {
        req.user = { id: 'u1', roles: ['admin'] };
        next();
    },
    requireContentLead: (req: any, _res: any, next: any) => {
        req.user = { id: 'u1', roles: ['admin'] };
        next();
    },
    requireDeveloper: (req: any, _res: any, next: any) => {
        req.user = { id: 'u1', roles: ['admin'] };
        next();
    }
}));

const startImport = vi.fn();
vi.mock('@moteurio/core/imports/importJobs.js', () => ({
    startImport: (...args: unknown[]) => startImport(...args),
    listImports: vi.fn(async () => []),
    getImport: vi.fn(async () => null),
    approveImport: vi.fn()
}));
vi.mock('@moteurio/core/imports/exportBundle.js', () => ({ exportBundle: vi.fn() }));

import importsRoute from '../../src/projects/imports';

const app = express();
app.use(express.json());
app.use('/projects/:projectId', importsRoute);

const job = (status: string) => ({ id: 'j1', status, dryRun: false, items: [], issues: [] });

describe('POST /projects/:projectId/imports', () => {
    beforeEach(() => startImport.mockReset());

    it('answers with the finished import', async () => {
        startImport.mockResolvedValue({
            job: job('running'),
            finished: Promise.resolve(job('done'))
        });
        const res = await request(app).post('/projects/p1/imports?dryRun=1').send({ version: 1 });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('done');
        expect(startImport.mock.calls[0]!.slice(1)).toEqual([
            'p1',
            { version: 1 },
            { dryRun: true }
        ]);
    });

    it('answers 422 when nothing was kept', async () => {
        startImport.mockResolvedValue({
            job: job('running'),
            finished: Promise.resolve(job('failed'))
        });
        const res = await request(app).post('/projects/p1/imports').send({ version: 1 });
        expect(res.status).toBe(422);
    });

    it('answers 202 with the job when it takes longer than asked to wait', async () => {
        startImport.mockResolvedValue({ job: job('running'), finished: new Promise(() => {}) });
        const res = await request(app).post('/projects/p1/imports?wait=0').send({ version: 1 });
        expect(res.status).toBe(202);
        expect(res.body).toMatchObject({ id: 'j1', status: 'running' });
    });

    it('404s an unknown import', async () => {
        expect((await request(app).get('/projects/p1/imports/nope')).status).toBe(404);
    });
});
