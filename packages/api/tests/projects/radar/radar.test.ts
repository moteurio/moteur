import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@moteurio/core/radar/index.js', () => ({
    loadRadarReport: vi.fn(async () => null),
    runFullScan: vi.fn()
}));
vi.mock('@moteurio/core/projectApiKey.js', () => ({
    verifyProjectApiKey: vi.fn(async () => ({
        ok: true,
        keyId: 'k1',
        policy: { channelAllowlist: null, allowSiteWideReads: true }
    }))
}));

import { runFullScan } from '@moteurio/core/radar/index.js';
import radarRouter from '../../../src/projects/radar/index.js';

const app = express();
app.use('/projects/:projectId/radar', radarRouter);

describe('Radar', () => {
    it('refuses a site’s API key: it reads drafts, and a scan saves and tells webhooks', async () => {
        const res = await request(app).get('/projects/demo/radar?scan=1').set('x-api-key', 'key');
        expect(res.status).toBe(401);
        expect(runFullScan).not.toHaveBeenCalled();
        const one = await request(app)
            .get('/projects/demo/radar/entry/hello')
            .set('x-api-key', 'key');
        expect(one.status).toBe(401);
    });
});
