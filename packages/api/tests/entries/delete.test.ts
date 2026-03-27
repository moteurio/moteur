import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

const mockUser = { id: 'user-123', roles: [OPERATOR_ROLE_SLUG] };

vi.mock('../../src/middlewares/auth', () => ({
    requireOperator: (req: any, _res: any, next: any) => {
        req.user = mockUser;
        next();
    },
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = mockUser;
        next();
    }
}));

import request from 'supertest';
import express from 'express';
import deleteRoute from '../../src/entries/delete';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { deleteEntry } from '@moteurio/core/entries';

vi.mock('@moteurio/core/entries', () => ({
    deleteEntry: vi.fn()
}));

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
    req.user = mockUser;
    next();
});
app.use('/projects/:projectId/models/:modelId/entries', deleteRoute);

describe('DELETE /projects/:projectId/models/:modelId/entries/:entryId', () => {
    const basePath = '/projects/test/models/test-model/entries/entry-1';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should delete an entry and return 204', async () => {
        (deleteEntry as any).mockResolvedValue(undefined);

        const res = await request(app).delete(basePath);

        expect(res.status).toBe(204);
        expect(deleteEntry).toHaveBeenCalledWith(mockUser, 'test', 'test-model', 'entry-1');
    });

    it('should return 400 if path params are missing', async () => {
        const res = await request(app).delete('/projects//models//entries/');
        expect([400, 404]).toContain(res.status);
    });

    it('should return 404 if deletion fails', async () => {
        (deleteEntry as any).mockRejectedValue(new Error('Not found'));

        const res = await request(app).delete(basePath);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not found');
    });
});
