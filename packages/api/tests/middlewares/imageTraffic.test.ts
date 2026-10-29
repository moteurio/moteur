import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requestClassifier } from '../../src/middlewares/requestClassifier.js';
import { usageLogging } from '../../src/middlewares/usageLogging.js';
import { requestQuota } from '../../src/middlewares/requestQuota.js';
import { imageTraffic } from '@moteurio/core/metering.js';
import { setImageTrafficQuota } from '@moteurio/core/planLimits.js';

const picture = Buffer.alloc(1000, 7);
const app = express();
app.use(requestClassifier, usageLogging, requestQuota);
// res.send answers with an ETag, and 304 when the browser has it, as the image routes do.
app.get('/static/resize/:projectId/:assetId', (_req, res) => void res.type('webp').send(picture));
app.get(
    '/static/assets/:projectId/:variant/:file',
    (_req, res) => void res.type('jpeg').send(picture)
);

describe('image traffic', () => {
    afterEach(() => setImageTrafficQuota(null));

    it('counts the images a project sends and their bytes, not the ones a browser already has', async () => {
        const first = await request(app).get('/static/resize/img-a/pic?w=640');
        expect(first.status).toBe(200);
        await request(app).get('/static/assets/img-a/original/pic.jpg');
        expect(imageTraffic('img-a')).toEqual({ requests: 2, bytes: 2000 });

        const again = await request(app)
            .get('/static/resize/img-a/pic?w=640')
            .set('If-None-Match', first.headers.etag);
        expect(again.status).toBe(304);
        await request(app).head('/static/resize/img-a/pic?w=640');
        expect(imageTraffic('img-a')).toEqual({ requests: 2, bytes: 2000 });
        // Its own count: another project's images and the API quota are apart.
        expect(imageTraffic('img-b')).toEqual({ requests: 0, bytes: 0 });
    });

    it("turns images away, uncached, once the month's bytes are sent", async () => {
        setImageTrafficQuota(projectId => (projectId === 'img-c' ? 1500 : null));
        expect((await request(app).get('/static/resize/img-c/pic?w=320')).status).toBe(200);
        expect((await request(app).get('/static/resize/img-c/pic?w=640')).status).toBe(200);
        const over = await request(app).get('/static/resize/img-c/pic?w=800');
        expect(over.status).toBe(402);
        expect(over.body).toMatchObject({ code: 'plan_limit', limit: 'imageTraffic' });
        expect(over.headers['cache-control']).toBe('no-store');
        expect(imageTraffic('img-c')).toEqual({ requests: 2, bytes: 2000 });
        // Other projects go on.
        expect((await request(app).get('/static/resize/img-d/pic?w=320')).status).toBe(200);
    });
});
