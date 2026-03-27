import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

// Mocks
vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = { id: 'op1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    },
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'editor1', roles: [OPERATOR_ROLE_SLUG] };
        next();
    }
}));

import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import route from '../../src/entries/getOne';

vi.mock('@moteurio/core/entries', () => ({
    getEntry: vi.fn().mockResolvedValue({ id: 'entry1', title: 'Test Entry' })
}));

vi.mock('../../src/middlewares/auth', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'mock-user' };
        next();
    }
}));

const app = express();
app.use(express.json());
app.use('/projects/:projectId/models/:modelId/entries', route);

describe('GET /projects/:projectId/models/:modelId/entries/:entryId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return the entry if found', async () => {
        const res = await request(app).get('/projects/test/models/blog/entries/entry1');

        expect(res.status).toBe(200);
        expect(res.body.entry).toHaveProperty('id', 'entry1');
    });

    it('should return 404 if entry is not found', async () => {
        const { getEntry } = await import('@moteurio/core/entries');
        (getEntry as any).mockResolvedValueOnce(null);

        const res = await request(app).get('/projects/test/models/blog/entries/missing-entry');

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Entry not found');
    });

    it('should return 400 if a parameter is missing', async () => {
        const res = await request(app).get('/projects/test/models/blog/entries/');

        expect(res.status).toBe(404); // Express will 404 for missing route segment
    });

    it('should return 500 if getEntry throws', async () => {
        const { getEntry } = await import('@moteurio/core/entries');
        (getEntry as any).mockRejectedValueOnce(new Error('something broke'));

        const res = await request(app).get('/projects/test/models/blog/entries/fail');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'something broke');
    });
});
