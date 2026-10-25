import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from './inject.js';

const { person, verifyJWT, generateSessionToken, createServer } = vi.hoisted(() => ({
    person: {
        id: 'person',
        email: 'person@example.com',
        isActive: true,
        roles: [],
        projects: ['demo']
    },
    verifyJWT: vi.fn(),
    generateSessionToken: vi.fn(() => 'internal-api-token'),
    createServer: vi.fn(() => ({ connect: vi.fn(), close: vi.fn() }))
}));
vi.mock('@moteurio/core/users.js', () => ({ getUserById: () => person }));
vi.mock('@moteurio/core/auth.js', () => ({ verifyJWT, generateSessionToken }));
vi.mock('@moteurio/core', async importOriginal => ({
    ...(await importOriginal<typeof import('@moteurio/core')>()),
    listPluginCommands: () => []
}));
vi.mock('@moteurio/mcp', async importOriginal => ({
    ...(await importOriginal<typeof import('@moteurio/mcp')>()),
    createServer
}));
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: class {
        async close() {}
        async handleRequest(_req: express.Request, res: express.Response) {
            res.json({ ok: true });
        }
    }
}));
import { mcpRouter } from '../../src/mcp/index.js';

function application(oauth: boolean) {
    const app = express();
    app.use(express.json());
    app.use(
        '/mcp',
        mcpRouter(
            () => 'https://api.example.com',
            undefined,
            (req, res, next) => {
                req.user = person;
                if (oauth)
                    res.locals.mcpConnection = {
                        current: () => ({
                            level: 'read',
                            projectIds: ['demo'],
                            allowCreateProjects: false
                        }),
                        created: vi.fn()
                    };
                next();
            }
        )
    );
    return app;
}

describe('merged OAuth and JWT MCP authentication', () => {
    beforeEach(() => vi.clearAllMocks());

    it('accepts authenticated opaque OAuth tokens and retains consent restrictions', async () => {
        verifyJWT.mockImplementation(() => {
            throw new Error('OAuth tokens are not JWTs');
        });
        const response = await request(application(true))
            .post('/mcp')
            .auth('mcp_at_opaque', { type: 'bearer' })
            .send({});
        expect(response.status).toBe(200);
        expect(verifyJWT).not.toHaveBeenCalled();
        expect(generateSessionToken).toHaveBeenCalledWith(
            expect.objectContaining({
                id: person.id,
                agent: expect.objectContaining({ reviewOnly: true })
            }),
            3600,
            undefined
        );
        expect(createServer).toHaveBeenCalledWith(
            expect.objectContaining({ beforeRun: expect.any(Function) })
        );
    });

    it('retains the verified JWT parent when exchanging a session token', async () => {
        const parent = { sub: person.id, sid: 'original-session' };
        verifyJWT.mockReturnValue(parent);
        const response = await request(application(false))
            .post('/mcp')
            .auth('person-jwt', { type: 'bearer' })
            .send({});
        expect(response.status).toBe(200);
        expect(verifyJWT).toHaveBeenCalledWith('person-jwt');
        expect(generateSessionToken).toHaveBeenCalledWith(expect.any(Object), 3600, parent);
    });
});
