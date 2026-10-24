import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import express from 'express';
import request from './inject.js';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    InvalidGrantError,
    InvalidTokenError
} from '@modelcontextprotocol/sdk/server/auth/errors.js';

const { person } = vi.hoisted(() => ({
    person: {
        id: 'louise',
        email: 'louise@example.com',
        name: 'Louise',
        isActive: true,
        roles: [],
        projects: [] as string[]
    }
}));
vi.mock('@moteurio/core/users.js', () => ({
    getUserById: (id: string) => (id === person.id ? person : undefined)
}));
vi.mock('@moteurio/core/projects.js', () => ({
    getProjectIdsForUser: () => person.projects,
    listProjects: () => person.projects.map(id => ({ id, label: id }))
}));
vi.mock('@moteurio/core/auth.js', () => ({
    actingUser: (user: object, payload: object) => ({ ...user, ...payload })
}));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (req.get('authorization') === 'Bearer another-session') {
            req.user = { ...person, id: 'another-user' };
            return void next();
        }
        if (req.get('authorization') !== 'Bearer studio-session')
            return void res.status(401).json({ error: 'Sign in' });
        req.user = person;
        next();
    }
}));
vi.mock('../../src/middlewares/rateLimit.js', () => ({
    studioRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next()
}));

import { createMcpOAuth, McpOAuthProvider } from '../../src/mcp/oauth.js';

let directory: string;
const resourceUrl = 'https://api.example.com/v1/mcp';
const studioUrl = 'https://studio.example.com';
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
const auth = { Authorization: 'Bearer studio-session' };
const policy = { level: 'content' as const, projectIds: ['demo'], allowCreateProjects: false };
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-oauth-'));
    person.isActive = true;
    person.projects = ['demo', 'other'];
});
afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
});

function setup() {
    const oauth = createMcpOAuth({ resourceUrl, studioUrl, directory });
    const app = express();
    app.use(express.json(), oauth.router);
    app.use('/v1/auth/mcp', oauth.consent);
    app.post('/v1/mcp', oauth.provider.authenticate, (req, res) => res.json({ user: req.user }));
    return { app, ...oauth };
}

async function start(provider: McpOAuthProvider) {
    const client = await provider.clientsStore.registerClient({
        redirect_uris: ['http://127.0.0.1/callback'],
        client_name: 'Codex',
        token_endpoint_auth_method: 'none'
    });
    const verifier = randomBytes(32).toString('base64url');
    let redirect = '';
    await provider.authorize(
        client,
        {
            redirectUri: 'http://127.0.0.1:53123/callback',
            codeChallenge: digest(verifier),
            state: 'state-123',
            resource: new URL(resourceUrl)
        },
        {
            redirect: (url: string) => {
                redirect = url;
            }
        } as Response
    );
    const id = new URL(redirect).searchParams.get('request')!;
    return { client, verifier, id };
}

async function grant(provider: McpOAuthProvider) {
    const started = await start(provider);
    const redirect = new URL(await provider.consent(started.id, person.id, true, policy));
    const code = redirect.searchParams.get('code')!;
    const tokens = await provider.exchangeAuthorizationCode(
        started.client,
        code,
        undefined,
        'http://127.0.0.1:53123/callback',
        new URL(resourceUrl)
    );
    return { ...started, tokens, code, redirect };
}

describe('MCP OAuth provider', () => {
    it('requires explicit project selection, current membership and a valid access level', async () => {
        const { provider } = setup();
        for (const value of [
            undefined,
            {},
            { ...policy, level: 'anything' },
            { ...policy, projectIds: [] },
            { ...policy, projectIds: ['not-my-project'] },
            { ...policy, allowCreateProjects: true }
        ]) {
            expect(() => provider.validatePolicy(person.id, value)).toThrow();
        }
        expect(provider.validatePolicy(person.id, policy)).toEqual(policy);
    });

    it('lets a new account opt into creation without sharing unrelated or future projects', async () => {
        const { provider } = setup();
        person.projects = [];
        const started = await start(provider);
        const onboarding = { level: 'developer', projectIds: [], allowCreateProjects: true };
        const code = new URL(
            await provider.consent(started.id, person.id, true, onboarding)
        ).searchParams.get('code')!;
        const tokens = await provider.exchangeAuthorizationCode(
            started.client,
            code,
            undefined,
            'http://127.0.0.1:53123/callback'
        );
        const info = await provider.verifyAccessToken(tokens.access_token);
        const connection = provider.connection(info.extra.grantId);
        expect(connection.current().projectIds).toEqual([]);
        await expect(connection.created('unrelated')).rejects.toThrow();
        person.projects = ['first-project', 'another-project'];
        await connection.created('first-project');
        expect(connection.current().projectIds).toEqual(['first-project']);
        const next = await provider.exchangeRefreshToken(started.client, tokens.refresh_token!);
        expect(
            provider
                .connection((await provider.verifyAccessToken(next.access_token)).extra.grantId)
                .current().projectIds
        ).toEqual(['first-project']);
    });

    it('does not reuse old unscoped credentials, and rechecks membership on each call', async () => {
        const { provider } = setup();
        const { tokens, client } = await grant(provider);
        const info = await provider.verifyAccessToken(tokens.access_token);
        person.projects = ['other'];
        expect(provider.connection(info.extra.grantId).current().projectIds).toEqual([]);
        await provider.store.update(data => {
            delete data.grants[info.extra.grantId].policy;
        });
        await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
        await expect(
            provider.exchangeRefreshToken(client, tokens.refresh_token!)
        ).rejects.toThrow();
    });
    it('persists hashed credentials and reloads a connection after restart', async () => {
        const { provider } = setup();
        const { tokens, redirect } = await grant(provider);
        expect(redirect.searchParams.get('state')).toBe('state-123');
        const restarted = new McpOAuthProvider({ resourceUrl, studioUrl, directory });
        const info = await restarted.verifyAccessToken(tokens.access_token);
        expect(info.extra).toMatchObject({ userId: person.id, agentName: 'Codex' });
        const raw = fs.readFileSync(path.join(directory, 'oauth.json'), 'utf8');
        expect(raw).not.toContain(tokens.access_token);
        expect(raw).not.toContain(tokens.refresh_token);
        expect(fs.statSync(path.join(directory, 'oauth.json')).mode & 0o777).toBe(0o600);
    });

    it('binds persisted tokens to the canonical MCP audience and caps renewal at the grant expiry', async () => {
        const { provider } = setup();
        const { tokens, client } = await grant(provider);
        const different = new McpOAuthProvider({
            resourceUrl: 'https://other.example.com/mcp',
            studioUrl,
            directory
        });
        await expect(different.verifyAccessToken(tokens.access_token)).rejects.toThrow();
        await expect(
            different.exchangeRefreshToken(client, tokens.refresh_token!)
        ).rejects.toThrow();
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 30 * 24 * 60 * 60 * 1000 - 60000);
        const renewed = await provider.exchangeRefreshToken(client, tokens.refresh_token!);
        expect(renewed.expires_in).toBeGreaterThan(0);
        expect(renewed.expires_in).toBeLessThanOrEqual(60);
    });

    it('expires connection requests and codes and supports standard token revocation', async () => {
        const { provider } = setup();
        const pending = await start(provider);
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
        expect(() => provider.pending(pending.id)).toThrow();
        await expect(provider.consent(pending.id, person.id, true, policy)).rejects.toThrow();
        clock.mockReturnValue(now);
        const started = await start(provider);
        const code = new URL(
            await provider.consent(started.id, person.id, true, policy)
        ).searchParams.get('code')!;
        clock.mockReturnValue(now + 61000);
        await expect(
            provider.challengeForAuthorizationCode(started.client, code)
        ).rejects.toThrow();
        const { tokens, client } = await grant(provider);
        await provider.revokeToken(client, { token: tokens.refresh_token! });
        await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
        await expect(
            provider.exchangeRefreshToken(client, tokens.refresh_token!)
        ).rejects.toThrow();
    });

    it('uses one-time requests and codes bound to client, exact redirect URI and resource', async () => {
        const { provider } = setup();
        const { id, client } = await start(provider);
        const code = new URL(await provider.consent(id, person.id, true, policy)).searchParams.get(
            'code'
        )!;
        await expect(provider.consent(id, person.id, true, policy)).rejects.toThrow();
        await expect(
            provider.exchangeAuthorizationCode(client, code, undefined, 'https://evil.example')
        ).rejects.toThrow(InvalidGrantError);
        await expect(
            provider.exchangeAuthorizationCode(
                client,
                code,
                undefined,
                'http://127.0.0.1:53123/callback',
                new URL('https://evil.example/mcp')
            )
        ).rejects.toThrow();
        await expect(
            provider.challengeForAuthorizationCode({ ...client, client_id: 'another-client' }, code)
        ).rejects.toThrow();
        await provider.exchangeAuthorizationCode(
            client,
            code,
            undefined,
            'http://127.0.0.1:53123/callback'
        );
        await expect(provider.challengeForAuthorizationCode(client, code)).rejects.toThrow();
    });

    it('rotates refresh tokens and revokes the entire connection on replay', async () => {
        const { provider } = setup();
        const { tokens, client } = await grant(provider);
        const next = await provider.exchangeRefreshToken(client, tokens.refresh_token!);
        expect(next.refresh_token).not.toBe(tokens.refresh_token);
        await expect(provider.verifyAccessToken(next.access_token)).resolves.toBeTruthy();
        await expect(provider.exchangeRefreshToken(client, tokens.refresh_token!)).rejects.toThrow(
            InvalidGrantError
        );
        await expect(provider.verifyAccessToken(next.access_token)).rejects.toThrow(
            InvalidTokenError
        );
        await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow(
            InvalidTokenError
        );
    });

    it('refuses disabled accounts, expired tokens, and added refresh scopes', async () => {
        const { provider } = setup();
        const { tokens, client } = await grant(provider);
        await expect(
            provider.exchangeRefreshToken(client, tokens.refresh_token!, ['operator'])
        ).rejects.toThrow();
        person.isActive = false;
        await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
        await expect(
            provider.exchangeRefreshToken(client, tokens.refresh_token!)
        ).rejects.toThrow();
        person.isActive = true;
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);
        await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
        await expect(
            provider.exchangeRefreshToken(client, tokens.refresh_token!)
        ).resolves.toBeTruthy();
    });

    it('rejects unsafe callback URLs and production HTTP endpoints', async () => {
        const { provider } = setup();
        for (const uri of [
            'http://evil.example/callback',
            'javascript:alert(1)',
            'https://client.example/#fragment',
            'https://user:pass@client.example/callback'
        ]) {
            await expect(
                provider.clientsStore.registerClient({ redirect_uris: [uri] })
            ).rejects.toThrow();
        }
        expect(
            () =>
                new McpOAuthProvider({
                    resourceUrl: 'http://api.example.com/mcp',
                    studioUrl,
                    directory
                })
        ).toThrow();
    });

    it('serializes concurrent mutations without losing registrations', async () => {
        const { provider } = setup();
        const second = new McpOAuthProvider({ resourceUrl, studioUrl, directory });
        await Promise.all(
            Array.from({ length: 20 }, (_, i) =>
                (i % 2 ? provider : second).clientsStore.registerClient({
                    redirect_uris: ['https://client.example/callback']
                })
            )
        );
        expect(Object.keys(provider.store.read().clients)).toHaveLength(20);
    });
});

describe('MCP OAuth HTTP flow', () => {
    it('lets only the account owner edit permissions, immediately and across token renewal', async () => {
        const { app, provider } = setup();
        const { tokens, client } = await grant(provider);
        const info = await provider.verifyAccessToken(tokens.access_token);
        const narrowed = { ...policy, level: 'read' };
        const path = `/v1/auth/mcp/connections/${info.extra.grantId}`;
        expect(
            (
                await request(app)
                    .patch(path)
                    .set({ Authorization: 'Bearer another-session' })
                    .send({ policy: narrowed })
            ).status
        ).toBe(404);
        expect(provider.connection(info.extra.grantId).current()).toEqual(policy);
        expect((await request(app).patch(path).set(auth).send({ policy: narrowed })).status).toBe(
            200
        );
        expect(provider.connection(info.extra.grantId).current()).toEqual(narrowed);
        const renewed = await provider.exchangeRefreshToken(client, tokens.refresh_token!);
        expect(
            provider
                .connection((await provider.verifyAccessToken(renewed.access_token)).extra.grantId)
                .current()
        ).toEqual(narrowed);
        expect(
            (
                await request(app)
                    .patch(path)
                    .set(auth)
                    .send({ policy: { ...policy, projectIds: ['not-my-project'] } })
            ).status
        ).toBe(400);
    });
    it('discovers, registers, signs in through Studio, enforces PKCE, and connects', async () => {
        const { app } = setup();
        const unauthorized = await request(app).post('/v1/mcp');
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers['www-authenticate']).toContain(
            '/.well-known/oauth-protected-resource/v1/mcp'
        );
        const metadata = await request(app).get('/.well-known/oauth-protected-resource/v1/mcp');
        expect(metadata.body.resource).toBe(resourceUrl);
        const discovery = await request(app).get('/.well-known/oauth-authorization-server');
        expect(discovery.body.registration_endpoint).toBe('https://api.example.com/register');
        const registered = await request(app)
            .post('/register')
            .send({
                client_name: 'Codex',
                redirect_uris: ['http://127.0.0.1/callback'],
                token_endpoint_auth_method: 'none'
            });
        expect(registered.status).toBe(201);
        const clientId = registered.body.client_id;
        const verifier = randomBytes(32).toString('base64url');
        const started = await request(app)
            .get('/authorize')
            .query({
                client_id: clientId,
                redirect_uri: 'http://127.0.0.1:50000/callback',
                response_type: 'code',
                code_challenge: digest(verifier),
                code_challenge_method: 'S256',
                resource: resourceUrl,
                state: 'original'
            });
        expect(started.status).toBe(302);
        const studio = new URL(started.headers.location);
        expect(studio.origin + studio.pathname).toBe(studioUrl + '/mcp/authorize');
        const id = studio.searchParams.get('request');
        expect((await request(app).get(`/v1/auth/mcp/requests/${id}`)).status).toBe(401);
        const details = await request(app).get(`/v1/auth/mcp/requests/${id}`).set(auth);
        expect(details.body.clientName).toBe('Codex');
        const consent = await request(app)
            .post(`/v1/auth/mcp/requests/${id}`)
            .set(auth)
            .send({ allow: true, policy });
        const callback = new URL(consent.body.redirectUrl);
        expect(callback.searchParams.get('state')).toBe('original');
        const payload = {
            grant_type: 'authorization_code',
            client_id: clientId,
            code: callback.searchParams.get('code'),
            redirect_uri: 'http://127.0.0.1:50000/callback',
            resource: resourceUrl
        };
        const wrong = await request(app)
            .post('/token')
            .type('form')
            .send({ ...payload, code_verifier: 'wrong' });
        expect(wrong.status).toBe(400);
        const token = await request(app)
            .post('/token')
            .type('form')
            .send({ ...payload, code_verifier: verifier });
        expect(token.status).toBe(200);
        expect(token.headers['cache-control']).toBe('no-store');
        const connected = await request(app)
            .post('/v1/mcp')
            .auth(token.body.access_token, { type: 'bearer' });
        expect(connected.status).toBe(200);
        expect(connected.body.user.agent).toEqual({ name: 'Codex', reviewOnly: true });
        // MCP credentials cannot approve themselves or manage connections.
        expect(
            (
                await request(app)
                    .get('/v1/auth/mcp/connections')
                    .auth(token.body.access_token, { type: 'bearer' })
            ).status
        ).toBe(401);
        const connections = await request(app).get('/v1/auth/mcp/connections').set(auth);
        expect(connections.body.connections).toHaveLength(1);
        expect(
            (
                await request(app)
                    .delete(`/v1/auth/mcp/connections/${connections.body.connections[0].id}`)
                    .set(auth)
            ).status
        ).toBe(204);
        expect(
            (await request(app).post('/v1/mcp').auth(token.body.access_token, { type: 'bearer' }))
                .status
        ).toBe(401);
        const refreshed = await request(app).post('/token').type('form').send({
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: token.body.refresh_token
        });
        expect(refreshed.status).toBe(400);
    });

    it('never redirects to an unregistered callback, and denial never issues a code', async () => {
        const { app, provider } = setup();
        const { client, id } = await start(provider);
        const invalid = await request(app)
            .get('/authorize')
            .query({ client_id: client.client_id, redirect_uri: 'https://evil.example' });
        expect(invalid.status).toBe(400);
        expect(invalid.headers.location).toBeUndefined();
        const denied = await request(app)
            .post(`/v1/auth/mcp/requests/${id}`)
            .set(auth)
            .send({ allow: false });
        const redirect = new URL(denied.body.redirectUrl);
        expect(redirect.searchParams.get('error')).toBe('access_denied');
        expect(redirect.searchParams.has('code')).toBe(false);
        expect(provider.store.read().codes).toEqual({});
    });
});
