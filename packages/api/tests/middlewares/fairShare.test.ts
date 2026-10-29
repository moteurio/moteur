import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestClassifier } from '../../src/middlewares/requestClassifier.js';
import { fairShare, resetFairShare } from '../../src/middlewares/fairShare.js';

/** A site route whose answers wait until the test lets them go. */
function app() {
    const held: Array<() => void> = [];
    let answered = 0;
    const a = express();
    a.use(requestClassifier, fairShare);
    a.get('/projects/:projectId/channels/site/pages', (_req, res) => {
        held.push(() => {
            answered++;
            res.json({ ok: true });
        });
    });
    return { a, held, answered: () => answered };
}

const settle = () => new Promise(r => globalThis.setTimeout(r, 30));

describe("each project's fair share of the server", () => {
    beforeEach(() => {
        resetFairShare();
        vi.stubEnv('MOTEUR_PUBLIC_CONCURRENCY', '2');
        vi.stubEnv('MOTEUR_PUBLIC_QUEUE', '3');
        vi.stubEnv('MOTEUR_PUBLIC_QUEUE_SECONDS', '5');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('lets a burst wait its turn instead of refusing it, one project apart from another', async () => {
        const { a, held } = app();
        const burst = Array.from({ length: 5 }, () =>
            request(a)
                .get('/projects/one/channels/site/pages')
                .then(r => r.status)
        );
        await settle();
        // Two answered at once, three waiting.
        expect(held).toHaveLength(2);
        // Another project isn't held up by the first one's queue.
        const other = request(a)
            .get('/projects/two/channels/site/pages')
            .then(r => r.status);
        await settle();
        expect(held).toHaveLength(3);
        // As answers go out, the waiting ones get their turn: every request is answered.
        while (held.length) {
            held.shift()!();
            await settle();
        }
        expect(await Promise.all([...burst, other])).toEqual([200, 200, 200, 200, 200, 200]);
    });

    it('turns away, with Retry-After, what the queue cannot hold or waits too long', async () => {
        vi.stubEnv('MOTEUR_PUBLIC_QUEUE_SECONDS', '0.1');
        const { a, held } = app();
        const send = () =>
            request(a)
                .get('/projects/one/channels/site/pages')
                .then(r => r);
        // 2 answered at once, 3 waiting, the 6th finds the queue full.
        const sent = Array.from({ length: 6 }, send);
        await new Promise(r => globalThis.setTimeout(r, 300));
        // By now the 3 waiting have waited too long.
        while (held.length) held.shift()!();
        const results = await Promise.all(sent);
        const refused = results.filter(r => r.status === 429);
        expect(refused).toHaveLength(4);
        expect(refused[0].headers['retry-after']).toBe('1');
        expect(refused[0].body.code).toBe('rate_limited');
        expect(results.filter(r => r.status === 200)).toHaveLength(2);
    });

    it('gives a place up when the visitor leaves while waiting', async () => {
        const { a, held, answered } = app();
        const server = a.listen(0);
        const port = (server.address() as { port: number }).port;
        const url = `http://127.0.0.1:${port}/projects/one/channels/site/pages`;
        const first = [globalThis.fetch(url), globalThis.fetch(url)];
        await settle();
        const leaving = new globalThis.AbortController();
        globalThis.fetch(url, { signal: leaving.signal }).catch(() => {});
        await settle();
        leaving.abort();
        await settle();
        const later = globalThis.fetch(url);
        await settle();
        held.shift()!();
        await settle();
        // The one who left didn't take the freed turn: the later request did.
        expect(held).toHaveLength(2);
        while (held.length) {
            held.shift()!();
            await settle();
        }
        expect((await later).status).toBe(200);
        expect(answered()).toBe(3);
        await Promise.all(first);
        server.close();
    });

    it("leaves the Studio's own requests alone", async () => {
        const a = express();
        a.use(requestClassifier, fairShare);
        a.get('/projects/:projectId/entries', (_req, res) => void res.json({ ok: true }));
        const all = await Promise.all(
            Array.from({ length: 10 }, () => request(a).get('/projects/one/entries'))
        );
        expect(all.every(r => r.status === 200)).toBe(true);
    });
});
