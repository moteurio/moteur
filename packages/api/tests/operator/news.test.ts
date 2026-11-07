import request from 'supertest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const who = vi.hoisted(() => ({ id: '' }));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireOperator: (req: any, _res: any, next: () => void) => {
        req.operator = { id: who.id, email: 'op@moteur.test' };
        next();
    }
}));

import operator from '../../src/operator/index.js';
import { addOperator } from '@moteurio/core/operators.js';
import { recordServerNews } from '@moteurio/core/serverNews.js';

const app = express();
app.use(express.json());
app.use('/operator', operator);

describe('operator news', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-op-news-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('OPERATORS_FILE', path.join(root, 'operators.json'));
        who.id = addOperator({ email: 'op@moteur.test' }).operator.id;
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lists what is new, newest first, and what came since you looked', async () => {
        recordServerNews(
            { kind: 'account-deleted', userId: 'a', email: 'a@x' },
            new Date(Date.now() - 2000)
        );
        recordServerNews(
            {
                kind: 'workspace',
                workspaceId: 'w',
                name: 'Agence Nord',
                userId: 'u',
                by: 'Louise'
            },
            new Date(Date.now() - 1000)
        );
        const all = await request(app).get('/operator/news');
        expect(all.status).toBe(200);
        expect(all.body).toMatchObject({ total: 2, seenAt: null, news: 'each' });
        expect(all.body.items.map((i: any) => i.kind)).toEqual(['workspace', 'account-deleted']);

        const seen = await request(app).post('/operator/news/seen');
        expect(seen.body.operator.newsSeenAt).toBeTruthy();
        const since = await request(app)
            .get('/operator/news')
            .query({ since: seen.body.operator.newsSeenAt });
        expect(since.body).toMatchObject({ items: [], total: 0 });
    });

    it('sets how you hear about it', async () => {
        const res = await request(app).patch('/operator/me').send({ news: 'daily' });
        expect(res.status).toBe(200);
        expect(res.body.operator.news).toBe('daily');
        expect((await request(app).get('/operator/news')).body.news).toBe('daily');
        expect((await request(app).patch('/operator/me').send({ news: 'weekly' })).status).toBe(
            400
        );
    });
});
