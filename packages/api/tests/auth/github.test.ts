import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/users', () => ({
    getUserByEmail: vi.fn(),
    createUser: vi.fn()
}));

vi.mock('@moteurio/core/auth', () => ({
    generateJWT: vi.fn().mockReturnValue('mock-jwt-token')
}));

vi.mock('../../src/auth/onboarding', () => ({
    runOnboardingForNewUser: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('axios', async () => {
    const actual = await vi.importActual<typeof import('axios')>('axios');
    const mocked = {
        ...actual,
        post: vi.fn(),
        get: vi.fn()
    };

    // Simulate a CommonJS-style default export (used by "import axios from 'axios'")
    return {
        ...mocked,
        default: mocked
    };
});

import { getUserByEmail, createUser } from '@moteurio/core/users';
import { generateJWT } from '@moteurio/core/auth';
import axios from 'axios';

type PluginRoutesFactory = (ctx: {
    requireAuth: (req: any, res: any, next: () => void) => void;
    requireProjectAccess: (req: any, res: any, next: () => void) => void;
    requireOperator: (req: any, res: any, next: () => void) => void;
}) => { path: string; router: express.Router };

let getRoutes: PluginRoutesFactory | undefined;
try {
    ({ getRoutes } = await import('@moteurio/plugin-auth-github'));
} catch {
    // Optional plugin not installed in this workspace.
}

const noop = (_req: any, _res: any, next: () => void) => next();
const app = express();
if (getRoutes) {
    const contrib = getRoutes({
        requireAuth: noop,
        requireProjectAccess: noop,
        requireOperator: noop
    });
    app.use(contrib.path, contrib.router);
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.AUTH_GITHUB_CLIENT_ID = 'client-id';
    process.env.AUTH_GITHUB_CLIENT_SECRET = 'client-secret';
    process.env.AUTH_GITHUB_REDIRECT_URI = 'http://localhost/auth/github/callback';

    vi.spyOn(console, 'error').mockImplementation(() => {});
});

const describeIfPlugin = getRoutes ? describe : describe.skip;

describeIfPlugin('GET /auth/github', () => {
    it('should redirect to GitHub OAuth screen', async () => {
        const res = await request(app).get('/auth/github');
        expect(res.status).toBe(302);
        expect(res.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize/);
    });
});

describeIfPlugin('GET /auth/github/callback', () => {
    it('should return 400 if no code is provided', async () => {
        const res = await request(app).get('/auth/github/callback');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Missing code' });
    });

    it('should create a new user and redirect with JWT token', async () => {
        (axios.post as any).mockResolvedValueOnce({
            data: { access_token: 'fake-token' }
        });
        (axios.get as any)
            .mockResolvedValueOnce({
                data: {
                    id: 123,
                    login: 'newuser',
                    name: 'New User'
                }
            })
            .mockResolvedValueOnce({
                data: [{ email: 'newuser@example.com', primary: true, verified: true }]
            });
        (getUserByEmail as any).mockResolvedValueOnce(null);
        (createUser as any).mockResolvedValueOnce(undefined);

        const res = await request(app).get('/auth/github/callback').query({ code: 'valid-code' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/auth/callback?token=mock-jwt-token');
        expect(createUser).toHaveBeenCalled();
        expect(generateJWT).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'newuser@example.com' })
        );
    });

    it('should reuse existing user and redirect with JWT token', async () => {
        (axios.post as any).mockResolvedValueOnce({
            data: { access_token: 'existing-token' }
        });
        (axios.get as any)
            .mockResolvedValueOnce({
                data: {
                    id: 456,
                    login: 'existinguser',
                    name: 'Existing User'
                }
            })
            .mockResolvedValueOnce({
                data: [{ email: 'existing@example.com', primary: true, verified: true }]
            });
        (getUserByEmail as any).mockResolvedValueOnce({
            id: 'user:existing',
            email: 'existing@example.com'
        });

        const res = await request(app).get('/auth/github/callback').query({ code: 'good-code' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/auth/callback?token=mock-jwt-token');
        expect(createUser).not.toHaveBeenCalled();
    });

    it('should return 401 if no verified primary email is found', async () => {
        (axios.post as any).mockResolvedValueOnce({
            data: { access_token: 'token-noemail' }
        });
        (axios.get as any)
            .mockResolvedValueOnce({
                data: {
                    id: 789,
                    login: 'noemail',
                    name: 'No Email'
                }
            })
            .mockResolvedValueOnce({
                data: [{ email: 'missing@example.com', primary: true, verified: false }]
            });

        const res = await request(app).get('/auth/github/callback').query({ code: 'bad-code' });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Error with github user' });
    });

    it('should return 500 if axios throws', async () => {
        (axios.post as any).mockRejectedValueOnce(new Error('fail'));

        const res = await request(app).get('/auth/github/callback').query({ code: 'error' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'GitHub login failed' });
    });
});
