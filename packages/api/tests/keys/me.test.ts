import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@moteurio/core/projectApiKey.js', () => ({
    findProjectForApiKey: vi.fn(),
    verifyProjectApiKey: vi.fn()
}));
vi.mock('@moteurio/core/channels.js', () => ({ listChannels: vi.fn() }));

import { findProjectForApiKey, verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { listChannels } from '@moteurio/core/channels.js';
import keysRouter from '../../src/keys/index.js';

const app = express();
app.use('/keys', keysRouter);

const ok = (channelAllowlist: string[] | null, extra: Record<string, unknown> = {}) =>
    vi.mocked(verifyProjectApiKey).mockResolvedValue({
        ok: true,
        keyId: 'k1',
        policy: { channelAllowlist, allowSiteWideReads: true },
        ...extra
    } as never);

describe('GET /keys/me', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(findProjectForApiKey).mockReturnValue('moteur-io');
        vi.mocked(listChannels).mockResolvedValue([{ id: 'site' }, { id: 'blog' }] as never);
    });

    it('says the project, and the key’s only channel', async () => {
        ok(['blog']);
        const res = await request(app).get('/keys/me').set('x-api-key', 'mk_live_x');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            projectId: 'moteur-io',
            keyId: 'k1',
            channels: ['blog'],
            channel: 'blog',
            siteWide: true
        });
        expect(verifyProjectApiKey).toHaveBeenCalledWith('moteur-io', 'mk_live_x');
    });

    it('gives "site" for a key that reads every channel, and no channel when there is doubt', async () => {
        ok(null);
        const every = await request(app).get('/keys/me').set('x-api-key', 'k');
        expect(every.body).toMatchObject({ channels: ['site', 'blog'], channel: 'site' });
        vi.mocked(listChannels).mockResolvedValue([{ id: 'blog' }, { id: 'shop' }] as never);
        const doubt = await request(app).get('/keys/me').set('x-api-key', 'k');
        expect(doubt.body.channel).toBeUndefined();
    });

    it('refuses no key, an unknown key and an expired one', async () => {
        expect((await request(app).get('/keys/me')).status).toBe(401);
        vi.mocked(findProjectForApiKey).mockReturnValue(null);
        expect((await request(app).get('/keys/me').set('x-api-key', 'k')).status).toBe(401);
        vi.mocked(findProjectForApiKey).mockReturnValue('moteur-io');
        vi.mocked(verifyProjectApiKey).mockResolvedValue({ ok: false, reason: 'expired' });
        const expired = await request(app).get('/keys/me').set('x-api-key', 'k');
        expect(expired.status).toBe(401);
        expect(expired.body.code).toBe('API_KEY_EXPIRED');
    });

    it('keeps a key to its hosts', async () => {
        ok(null, { allowedHosts: ['moteur.io'] });
        const res = await request(app)
            .get('/keys/me')
            .set('x-api-key', 'k')
            .set('Origin', 'https://evil.example');
        expect(res.status).toBe(403);
    });
});
