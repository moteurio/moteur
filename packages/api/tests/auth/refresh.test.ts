import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 🧪 generateJWT mock for all tests
vi.mock('@moteurio/core/auth', () => ({
    generateJWT: vi.fn()
}));

import { generateJWT } from '@moteurio/core/auth';

describe('POST /auth/refresh', () => {
    beforeEach(() => {
        vi.resetModules(); // 💥 Clear previous mocks + module cache
        vi.clearAllMocks();
    });

    it('should return 200 and a new JWT token if user is present', async () => {
        // ✅ Set up auth middleware that sets req.user
        vi.doMock('../../src/middlewares/auth', () => ({
            requireAuth: (req: any, _res: any, next: any) => {
                req.user = { id: 'user123', username: 'bob' };
                next();
            }
        }));

        const app = express();
        app.use(express.json());
        const route = (await import('../../src/auth/refresh')).default;
        app.use('/auth', route);
        (generateJWT as any).mockReturnValue('mock-token');
        const res = await request(app).post('/auth/refresh');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ token: 'mock-token' });
    });

    it('should return 401 if user is missing', async () => {
        // ✅ Set up auth middleware that sets no user
        vi.doMock('../../src/middlewares/auth', () => ({
            requireAuth: (req: any, _res: any, next: any) => {
                req.user = undefined;
                next();
            }
        }));

        const app = express();
        app.use(express.json());
        const route = (await import('../../src/auth/refresh')).default;
        app.use('/auth', route);

        const res = await request(app).post('/auth/refresh');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Unauthorized' });
    });
});
