import request from 'supertest';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireOperator: (req: any, _res: any, next: () => void) => {
        req.operator = { id: 'op1', email: 'op@moteur.test' };
        req.user = { id: 'op1', name: 'Op' };
        next();
    }
}));

const trash = vi.hoisted(() => ({
    list: [
        { id: 'journal', deletedAt: '2026-11-02T10:00:00Z', folder: 'journal@2026-11-02T10-00-00Z' }
    ],
    purged: [] as string[]
}));
vi.mock('@moteurio/core/projects.js', async importOriginal => ({
    ...(await importOriginal<object>()),
    listTrashedProjects: () => trash.list,
    purgeTrashedProject: (folder: string) => {
        if (!trash.list.some(t => t.folder === folder))
            throw Object.assign(new Error('No such project in the trash'), { status: 404 });
        trash.purged.push(folder);
    },
    purgeProject: async (_op: unknown, id: string) => {
        if (id !== 'atelier')
            throw Object.assign(new Error(`Project "${id}" not found`), { status: 404 });
        trash.purged.push(id);
    }
}));

import operator from '../../src/operator/index.js';

const app = express();
app.use(express.json());
app.use('/operator', operator);

describe('operators and deleted projects', () => {
    it('list the trash', async () => {
        const res = await request(app).get('/operator/projects/trash');
        expect(res.status).toBe(200);
        expect(res.body.projects).toEqual(trash.list);
    });

    it('remove a copy from the trash for good, and a live project at once', async () => {
        expect(
            (await request(app).delete('/operator/projects/trash/journal@2026-11-02T10-00-00Z'))
                .status
        ).toBe(204);
        expect((await request(app).delete('/operator/projects/atelier')).status).toBe(204);
        expect(trash.purged).toEqual(['journal@2026-11-02T10-00-00Z', 'atelier']);
    });

    it('say when there is nothing by that name', async () => {
        expect((await request(app).delete('/operator/projects/trash/nope')).status).toBe(404);
        expect((await request(app).delete('/operator/projects/nope')).status).toBe(404);
    });
});
