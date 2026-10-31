import request from 'supertest';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@moteurio/core/projectApiKey.js', () => ({ verifyProjectApiKey: vi.fn() }));
vi.mock('@moteurio/core/apiKeyUsage.js', () => ({ noteApiKeyUse: vi.fn() }));

import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { noteApiKeyUse } from '@moteurio/core/apiKeyUsage.js';
import { apiKeyAuth } from '../../src/middlewares/auth.js';

const app = express();
app.get('/projects/:projectId/read', apiKeyAuth, (_req, res) => void res.json({ ok: true }));

const accept = (extra: Record<string, unknown> = {}) =>
    vi.mocked(verifyProjectApiKey).mockResolvedValue({
        ok: true,
        keyId: 'k1',
        policy: { channelAllowlist: null, allowSiteWideReads: true },
        ...extra
    } as never);

describe('apiKeyAuth: a key’s last use', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is noted when a request is authenticated with the key', async () => {
        accept();
        const res = await request(app).get('/projects/p1/read').set('x-api-key', 'mk_live_x');
        expect(res.status).toBe(200);
        expect(noteApiKeyUse).toHaveBeenCalledWith('p1', 'k1');
    });

    it('is not noted for a refused key, or one used from another host', async () => {
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: false });
        expect(
            (await request(app).get('/projects/p1/read').set('x-api-key', 'mk_live_x')).status
        ).toBe(401);
        accept({ allowedHosts: ['moteur.io'] });
        const elsewhere = await request(app)
            .get('/projects/p1/read')
            .set('x-api-key', 'mk_live_x')
            .set('Origin', 'https://evil.example');
        expect(elsewhere.status).toBe(403);
        expect(noteApiKeyUse).not.toHaveBeenCalled();
    });
});
