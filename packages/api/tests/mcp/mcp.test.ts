import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const person = {
    id: 'louise',
    name: 'Louise',
    email: 'louise@test.dev',
    isActive: true,
    roles: ['writer'],
    projects: ['demo']
};

vi.mock('@moteurio/core/users.js', () => ({ getUserById: () => person }));
vi.mock('@moteurio/core/projects.js', () => ({ getProjectIdsForUser: () => ['demo'] }));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: any, res: any, next: any) => {
        if (!req.headers.authorization)
            return void res.status(401).json({ error: 'No token provided' });
        req.user = person;
        next();
    }
}));

/** A stand-in for the API the tools call: records who called. */
const calls: { url: string; agent?: { name: string; reviewOnly: boolean } }[] = [];
const fakeApi = express();
fakeApi.use((req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    calls.push({ url: req.url, agent: (jwt.decode(token) as any)?.agent });
    res.json({ entries: [], total: 0 });
});

let server: ReturnType<typeof fakeApi.listen>;
let app: express.Express;

beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    server = fakeApi.listen(0);
    const port = (server.address() as AddressInfo).port;
    const { mcpRouter } = await import('../../src/mcp/index.js');
    app = express();
    app.use(express.json());
    app.use(
        '/mcp',
        mcpRouter(() => `http://127.0.0.1:${port}`)
    );
});
afterAll(() => {
    server.close();
    vi.unstubAllEnvs();
});

const rpc = (body: unknown, path = '/mcp?project=demo') =>
    request(app)
        .post(path)
        .set('Authorization', 'Bearer person-token')
        .set('Accept', 'application/json, text/event-stream')
        .set('User-Agent', 'claude-code/2.1')
        .send(body);

describe('POST /mcp', () => {
    it('needs a sign-in', async () => {
        const res = await request(app).post('/mcp').send({});
        expect(res.status).toBe(401);
    });

    it('answers initialize and lists tools, as the query asks', async () => {
        const init = await rpc({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test', version: '1' }
            }
        });
        expect(init.status).toBe(200);
        expect(init.body.result.serverInfo.name).toBe('moteur');
        const list = await rpc(
            { jsonrpc: '2.0', id: 2, method: 'tools/list' },
            '/mcp?groups=entries&readOnly=1'
        );
        const names = list.body.result.tools.map((t: { name: string }) => t.name);
        expect(names).toContain('entries_list');
        expect(names).not.toContain('entries_update');
    });

    it('calls the API as an agent for the person, review-only', async () => {
        const res = await rpc({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'entries_list', arguments: { model: 'article' } }
        });
        expect(res.body.result.isError).toBeFalsy();
        expect(calls.at(-1)).toEqual({
            url: '/projects/demo/models/article/entries?sort=-updatedAt&limit=50',
            agent: { name: 'Claude Code', reviewOnly: true }
        });
    });

    it('has no stream to open', async () => {
        expect((await request(app).get('/mcp')).status).toBe(405);
    });
});
