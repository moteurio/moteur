import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('@moteurio/core/projectCounts.js', async () => {
    const { COUNT_KINDS } = await import('@moteurio/core/planLimits.js');
    return { projectCounts: vi.fn(async () => Object.fromEntries(COUNT_KINDS.map(k => [k, 0]))) };
});
vi.mock('@moteurio/core/assets/assetService.js', () => ({ storageUsed: vi.fn(async () => 0) }));
vi.mock('@moteurio/core/users.js', () => ({ getProjectUsers: vi.fn(() => []) }));
vi.mock('@moteurio/core/invites.js', () => ({ listInvites: vi.fn(() => []) }));

import { requestClassifier } from '../../src/middlewares/requestClassifier.js';
import { usageLogging } from '../../src/middlewares/usageLogging.js';
import { requestQuota } from '../../src/middlewares/requestQuota.js';
import { projectUsage } from '../../src/projects/usage.js';
import {
    setImageTrafficFairUse,
    setImageTrafficQuota,
    setRequestFairUse,
    setRequestQuota
} from '@moteurio/core/planLimits.js';
import { recordImageTraffic } from '@moteurio/core/metering.js';

const app = express();
app.use(requestClassifier, usageLogging, requestQuota);
app.get('/projects/:projectId/channels/:channelId/entries', (_req, res) => void res.json([]));

describe('public requests', () => {
    afterEach(() => {
        setRequestFairUse(null);
        setRequestQuota(null);
    });

    it('past the fair use level are still answered, and counted', async () => {
        setRequestFairUse(id => (id === 'fair-a' ? 2 : null));
        for (let i = 0; i < 4; i++) {
            const res = await request(app).get('/projects/fair-a/channels/site/entries');
            expect(res.status).toBe(200);
        }
        expect((await projectUsage('fair-a')).requests).toEqual({
            public: 4,
            max: null,
            fairUse: 2
        });
        expect((await projectUsage('fair-b')).requests).toEqual({
            public: 0,
            max: null,
            fairUse: null
        });
    });

    it('past the month’s quota are turned away, and not counted', async () => {
        setRequestQuota(id => (id === 'quota-a' ? 2 : null));
        const statuses = [];
        for (let i = 0; i < 3; i++) {
            statuses.push(
                (await request(app).get('/projects/quota-a/channels/site/entries')).status
            );
        }
        expect(statuses).toEqual([200, 200, 402]);
        expect((await projectUsage('quota-a')).requests).toEqual({
            public: 2,
            max: 2,
            fairUse: null
        });
    });
});

describe('image traffic', () => {
    afterEach(() => {
        setImageTrafficFairUse(null);
        setImageTrafficQuota(null);
    });

    it('reports the fair use level apart from the quota', async () => {
        setImageTrafficFairUse(id => (id === 'img-paid' ? 1000 : null));
        setImageTrafficQuota(id => (id === 'img-free' ? 500 : null));
        recordImageTraffic('img-paid', 4000);
        expect((await projectUsage('img-paid')).images).toMatchObject({
            bytes: 4000,
            max: null,
            fairUse: 1000
        });
        expect((await projectUsage('img-free')).images).toMatchObject({ max: 500, fairUse: null });
    });
});
