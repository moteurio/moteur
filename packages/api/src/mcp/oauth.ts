/** MCP's OAuth server. Studio owns sign-in, account creation, and explicit consent. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import type { RequestHandler, Response } from 'express';
import { Router } from 'express';
import type {
    OAuthServerProvider,
    AuthorizationParams
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type {
    OAuthClientInformationFull,
    OAuthTokenRevocationRequest,
    OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
    InvalidClientMetadataError,
    InvalidGrantError,
    InvalidRequestError,
    InvalidScopeError,
    InvalidTargetError,
    InvalidTokenError,
    OAuthError,
    TooManyRequestsError
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {
    mcpAuthRouter,
    getOAuthProtectedResourceMetadataUrl
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { getUserById } from '@moteurio/core/users.js';
import { actingUser } from '@moteurio/core/auth.js';
import { getProjectIdsForUser, listProjects } from '@moteurio/core/projects.js';
import type { McpAccessPolicy, McpConnection } from './access.js';
import { requireAuth } from '../middlewares/auth.js';
import { studioRateLimiter } from '../middlewares/rateLimit.js';
import { OAuthStore, type OAuthData, type Grant, type PendingAuthorization } from './oauthStore.js';

const HOUR = 60 * 60 * 1000;
const MONTH = 30 * 24 * HOUR;
const SCOPE = 'moteur';
const opaque = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function room(records: Record<string, unknown>): void {
    if (Object.keys(records).length >= 10000) {
        throw new TooManyRequestsError('Too many OAuth records; try again later');
    }
}

function webUrl(value: string): URL {
    const url = new URL(value);
    if (
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname)))
    ) {
        throw new Error('MCP URLs must use HTTPS (HTTP is allowed on loopback only)');
    }
    return url;
}

export interface McpOAuthOptions {
    /** Canonical public MCP URL, including API_BASE_PATH when present. Never inferred from Host. */
    resourceUrl: string;
    studioUrl: string;
    directory: string;
}

export class McpOAuthProvider implements OAuthServerProvider {
    readonly store: OAuthStore;
    readonly resource: URL;
    readonly studio: URL;
    readonly issuer: URL;

    constructor(options: McpOAuthOptions) {
        this.resource = webUrl(options.resourceUrl);
        if (this.resource.search) throw new Error('MOTEUR_MCP_PUBLIC_URL must not contain a query');
        this.studio = webUrl(options.studioUrl);
        if (this.studio.search) throw new Error('STUDIO_URL must not contain a query');
        this.issuer = new URL(this.resource.origin);
        this.store = new OAuthStore(options.directory);
    }

    readonly clientsStore = {
        getClient: async (id: string): Promise<OAuthClientInformationFull | undefined> => {
            const saved = this.store.read().clients[id];
            return saved && saved.expires > Date.now() ? saved.client : undefined;
        },
        registerClient: async (
            input: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
        ): Promise<OAuthClientInformationFull> => {
            if (JSON.stringify(input).length > 32768)
                throw new InvalidClientMetadataError('Client metadata is too large');
            if (input.redirect_uris.length > 10 || !input.redirect_uris.length) {
                throw new InvalidClientMetadataError('Provide between one and ten redirect URIs');
            }
            try {
                for (const uri of input.redirect_uris) {
                    if (uri.length > 2048) throw new Error('URI too long');
                    webUrl(uri);
                }
            } catch {
                throw new InvalidClientMetadataError(
                    'Redirect URIs must use HTTPS or HTTP loopback, without fragments or credentials'
                );
            }
            if (input.client_name && input.client_name.length > 100) {
                throw new InvalidClientMetadataError('Client name is too long');
            }
            if (
                input.token_endpoint_auth_method &&
                !['none', 'client_secret_post'].includes(input.token_endpoint_auth_method)
            ) {
                throw new InvalidClientMetadataError(
                    'Use none or client_secret_post authentication'
                );
            }
            const client = {
                ...input,
                client_id: randomUUID(),
                client_id_issued_at: Math.floor(Date.now() / 1000)
            };
            await this.store.update(data => {
                room(data.clients);
                // Clients outlive their refresh grants. Reconnecting registers a fresh client.
                data.clients[client.client_id] = { client, expires: Date.now() + 365 * 24 * HOUR };
            });
            return client;
        }
    };

    private checkResource(resource?: URL): void {
        // Query parameters select tools/project; they don't designate a different MCP audience.
        if (
            resource &&
            (resource.origin !== this.resource.origin ||
                resource.pathname !== this.resource.pathname ||
                resource.hash)
        ) {
            throw new InvalidTargetError('This authorization is only for this Moteur MCP server');
        }
    }

    async authorize(
        client: OAuthClientInformationFull,
        params: AuthorizationParams,
        res: Response
    ): Promise<void> {
        this.checkResource(params.resource);
        const scopes = params.scopes?.length ? params.scopes : [SCOPE];
        if (scopes.some(s => s !== SCOPE))
            throw new InvalidScopeError('Only the moteur scope is supported');
        if (
            !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) ||
            (params.state?.length ?? 0) > 2048
        ) {
            throw new InvalidRequestError('Invalid PKCE challenge or state');
        }
        const id = opaque();
        await this.store.update(data => {
            room(data.pending);
            data.pending[hash(id)] = {
                clientId: client.client_id,
                redirectUri: params.redirectUri,
                challenge: params.codeChallenge,
                state: params.state,
                resource: this.resource.href,
                scopes,
                expires: Date.now() + 10 * 60 * 1000
            };
        });
        const url = new URL(
            `${this.studio.pathname.replace(/\/$/, '')}/mcp/authorize`,
            this.studio
        );
        url.searchParams.set('request', id);
        res.redirect(url.href);
    }

    pending(id: string): PendingAuthorization {
        const pending = this.store.read().pending[hash(id)];
        if (!pending || pending.expires <= Date.now())
            throw new InvalidRequestError(
                'This connection request expired. Start again from your MCP client.'
            );
        return pending;
    }

    validatePolicy(userId: string, value: unknown): McpAccessPolicy {
        if (!value || typeof value !== 'object')
            throw new InvalidRequestError('Choose projects and an access level');
        const { level, projectIds, allowCreateProjects } = value as McpAccessPolicy;
        if (
            !['read', 'content', 'developer'].includes(level) ||
            !Array.isArray(projectIds) ||
            projectIds.length > 1000 ||
            projectIds.some(id => typeof id !== 'string') ||
            typeof allowCreateProjects !== 'boolean'
        ) {
            throw new InvalidRequestError('Invalid project permissions');
        }
        if (allowCreateProjects && level !== 'developer')
            throw new InvalidRequestError('Creating projects requires full project setup access');
        if (!projectIds.length && !allowCreateProjects)
            throw new InvalidRequestError('Choose at least one project or allow new projects');
        const current = getProjectIdsForUser(userId);
        if (projectIds.some(id => !current.includes(id)))
            throw new InvalidRequestError('You can only grant projects you currently belong to');
        return { level, projectIds: [...new Set(projectIds)], allowCreateProjects };
    }

    connection(id: string): McpConnection {
        return {
            current: () => {
                const grant = this.store.read().grants[id];
                if (
                    !grant?.policy ||
                    grant.revoked ||
                    grant.expires <= Date.now() ||
                    !getUserById(grant.userId)?.isActive
                )
                    throw new InvalidTokenError(
                        'MCP connection expired, changed or was disconnected'
                    );
                const current = getProjectIdsForUser(grant.userId);
                return {
                    ...grant.policy,
                    projectIds: grant.policy.projectIds.filter(project => current.includes(project))
                };
            },
            created: async projectId => {
                await this.store.update(data => {
                    const grant = data.grants[id];
                    if (
                        !grant?.policy?.allowCreateProjects ||
                        grant.policy.level !== 'developer' ||
                        grant.revoked ||
                        !getProjectIdsForUser(grant.userId).includes(projectId)
                    )
                        throw new InvalidTokenError(
                            'The new project cannot be added to this connection'
                        );
                    if (!grant.policy.projectIds.includes(projectId))
                        grant.policy.projectIds.push(projectId);
                });
            }
        };
    }

    async consent(
        id: string,
        userId: string,
        allow: boolean,
        requestedPolicy?: unknown
    ): Promise<string> {
        const user = getUserById(userId);
        if (!user?.isActive) throw new InvalidRequestError('An active account is required');
        const policy = allow ? this.validatePolicy(userId, requestedPolicy) : undefined;
        return this.store.update(data => {
            const pending = data.pending[hash(id)];
            if (!pending)
                throw new InvalidRequestError(
                    'This connection request expired or was already used'
                );
            const client = data.clients[pending.clientId]?.client;
            if (!client) throw new InvalidRequestError('The MCP client registration expired');
            delete data.pending[hash(id)];
            const redirect = new URL(pending.redirectUri);
            if (pending.state !== undefined) redirect.searchParams.set('state', pending.state);
            if (allow) {
                room(data.codes);
                const code = opaque();
                data.codes[hash(code)] = {
                    ...pending,
                    userId,
                    policy,
                    agentName: client.client_name?.trim().slice(0, 40) || 'MCP client',
                    expires: Date.now() + 60 * 1000
                };
                redirect.searchParams.set('code', code);
            } else redirect.searchParams.set('error', 'access_denied');
            return redirect.href;
        });
    }

    async challengeForAuthorizationCode(
        client: OAuthClientInformationFull,
        code: string
    ): Promise<string> {
        const saved = this.store.read().codes[hash(code)];
        if (!saved || saved.expires <= Date.now() || saved.clientId !== client.client_id)
            throw new InvalidGrantError('Invalid authorization code');
        return saved.challenge;
    }

    private issue(data: OAuthData, grantId: string, grant: Grant): OAuthTokens {
        room(data.access);
        room(data.refresh);
        const now = Date.now();
        const expires = Math.min(now + HOUR, grant.expires);
        const access = `mcp_at_${opaque()}`;
        const refresh = `mcp_rt_${opaque()}`;
        data.access[hash(access)] = { grantId, expires };
        data.refresh[hash(refresh)] = { grantId, expires: grant.expires };
        return {
            access_token: access,
            refresh_token: refresh,
            token_type: 'Bearer',
            expires_in: Math.floor((expires - now) / 1000),
            scope: grant.scopes.join(' ')
        };
    }

    async exchangeAuthorizationCode(
        client: OAuthClientInformationFull,
        code: string,
        _verifier?: string,
        redirectUri?: string,
        resource?: URL
    ): Promise<OAuthTokens> {
        this.checkResource(resource);
        return this.store.update(data => {
            const saved = data.codes[hash(code)];
            if (
                !saved ||
                saved.clientId !== client.client_id ||
                saved.resource !== this.resource.href ||
                !saved.policy ||
                redirectUri !== saved.redirectUri ||
                !getUserById(saved.userId)?.isActive
            ) {
                throw new InvalidGrantError('Invalid authorization code, account or redirect URI');
            }
            delete data.codes[hash(code)];
            room(data.grants);
            const grantId = randomUUID();
            const grant: Grant = {
                clientId: saved.clientId,
                userId: saved.userId,
                agentName: saved.agentName,
                resource: saved.resource,
                scopes: saved.scopes,
                policy: saved.policy,
                expires: Date.now() + MONTH
            };
            data.grants[grantId] = grant;
            return this.issue(data, grantId, grant);
        });
    }

    async exchangeRefreshToken(
        client: OAuthClientInformationFull,
        token: string,
        scopes?: string[],
        resource?: URL
    ): Promise<OAuthTokens> {
        this.checkResource(resource);
        const result = await this.store.update(data => {
            const saved = data.refresh[hash(token)];
            const grant = saved && data.grants[saved.grantId];
            if (
                !saved ||
                !grant ||
                grant.clientId !== client.client_id ||
                grant.resource !== this.resource.href ||
                !grant.policy ||
                grant.revoked ||
                !getUserById(grant.userId)?.isActive
            )
                return null;
            if (saved.used) {
                // Commit revocation before returning an error: replay invalidates the entire family.
                grant.revoked = true;
                return null;
            }
            if (scopes?.some(scope => !grant.scopes.includes(scope)))
                throw new InvalidScopeError('Refresh cannot add permissions');
            saved.used = true;
            return this.issue(data, saved.grantId, grant);
        });
        if (!result) throw new InvalidGrantError('Invalid or reused refresh token; connect again');
        return result;
    }

    async verifyAccessToken(token: string) {
        const data = this.store.read();
        const access = data.access[hash(token)];
        const grant = access && data.grants[access.grantId];
        if (
            !access ||
            access.expires <= Date.now() ||
            !grant ||
            grant.resource !== this.resource.href ||
            !grant.policy ||
            grant.revoked ||
            grant.expires <= Date.now() ||
            !getUserById(grant.userId)?.isActive
        ) {
            throw new InvalidTokenError('MCP connection expired or was disconnected');
        }
        return {
            token,
            clientId: grant.clientId,
            scopes: grant.scopes,
            expiresAt: Math.floor(access.expires / 1000),
            resource: new URL(grant.resource),
            extra: { userId: grant.userId, agentName: grant.agentName, grantId: access.grantId }
        };
    }

    async revokeToken(
        client: OAuthClientInformationFull,
        request: OAuthTokenRevocationRequest
    ): Promise<void> {
        await this.store.update(data => {
            const saved = data.access[hash(request.token)] ?? data.refresh[hash(request.token)];
            const grant = saved && data.grants[saved.grantId];
            if (grant?.clientId === client.client_id) grant.revoked = true;
        });
    }

    /** OAuth tokens are accepted only at MCP, never as general Studio/API or operator sessions. */
    readonly authenticate: RequestHandler = async (req, res, next) => {
        const challenge = `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(this.resource)}"`;
        res.setHeader('WWW-Authenticate', challenge);
        const token = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
        if (!token?.startsWith('mcp_at_')) return requireAuth(req, res, next);
        try {
            const auth = await this.verifyAccessToken(token);
            req.user = actingUser(getUserById(auth.extra.userId)!, {
                agent: { name: auth.extra.agentName, reviewOnly: true }
            });
            res.locals.mcpConnection = this.connection(auth.extra.grantId);
            next();
        } catch (error) {
            if (!(error instanceof InvalidTokenError)) return next(error);
            res.status(401).json({ error: 'invalid_token', error_description: error.message });
        }
    };
}

export function createMcpOAuth(options: McpOAuthOptions): {
    provider: McpOAuthProvider;
    router: Router;
    consent: Router;
} {
    const provider = new McpOAuthProvider(options);
    const router = Router();
    router.use(
        mcpAuthRouter({
            provider,
            issuerUrl: provider.issuer,
            resourceServerUrl: provider.resource,
            scopesSupported: [SCOPE],
            resourceName: 'Moteur projects'
        })
    );
    // Legacy clients may probe the origin-level protected-resource metadata endpoint.
    router.get('/.well-known/oauth-protected-resource', (_req, res) =>
        res.json({
            resource: provider.resource.href,
            authorization_servers: [provider.issuer.href],
            scopes_supported: [SCOPE]
        })
    );
    const consent = Router();
    consent.use(studioRateLimiter, requireAuth, (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (req.user?.agent)
            return void res
                .status(403)
                .json({ error: 'Sign in as yourself to manage MCP connections' });
        next();
    });
    consent.get('/requests/:id', async (req, res) => {
        try {
            const pending = provider.pending(String(req.params.id));
            const client = await provider.clientsStore.getClient(pending.clientId);
            res.json({
                clientName: client?.client_name || 'MCP client',
                redirectUri: pending.redirectUri,
                resource: pending.resource,
                projects: listProjects(req.user!).map(p => ({ id: p.id, label: p.label }))
            });
        } catch (error) {
            if (!(error instanceof OAuthError)) throw error;
            res.status(400).json(error.toResponseObject());
        }
    });
    consent.post('/requests/:id', async (req, res) => {
        if (typeof req.body?.allow !== 'boolean')
            return void res.status(400).json({ error: 'Choose whether to connect' });
        try {
            res.json({
                redirectUrl: await provider.consent(
                    String(req.params.id),
                    req.user!.id,
                    req.body.allow,
                    req.body.policy
                )
            });
        } catch (error) {
            if (!(error instanceof OAuthError)) throw error;
            res.status(400).json(error.toResponseObject());
        }
    });
    consent.get('/connections', (req, res) => {
        const data = provider.store.read();
        res.json({
            projects: listProjects(req.user!).map(p => ({ id: p.id, label: p.label })),
            connections: Object.entries(data.grants)
                .filter(
                    ([, g]) => g.userId === req.user!.id && !g.revoked && g.expires > Date.now()
                )
                .map(([id, g]) => ({
                    id,
                    clientName: g.agentName,
                    policy: g.policy,
                    expiresAt: new Date(g.expires).toISOString()
                }))
        });
    });
    consent.patch('/connections/:id', async (req, res) => {
        try {
            const policy = provider.validatePolicy(req.user!.id, req.body?.policy);
            const updated = await provider.store.update(data => {
                const grant = data.grants[String(req.params.id)];
                if (
                    !grant ||
                    grant.userId !== req.user!.id ||
                    grant.revoked ||
                    grant.expires <= Date.now()
                )
                    return false;
                grant.policy = policy;
                return true;
            });
            if (!updated) return void res.status(404).json({ error: 'Connection not found' });
            res.json({ policy });
        } catch (error) {
            if (!(error instanceof OAuthError)) throw error;
            res.status(400).json(error.toResponseObject());
        }
    });
    consent.delete('/connections/:id', async (req, res) => {
        await provider.store.update(data => {
            const grant = data.grants[String(req.params.id)];
            if (grant?.userId === req.user!.id) grant.revoked = true;
        });
        res.status(204).end();
    });
    return { provider, router, consent };
}
