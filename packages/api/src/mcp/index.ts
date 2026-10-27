/**
 * Moteur over MCP, hosted: `POST /mcp` speaks the Model Context Protocol (Streamable HTTP), so
 * claude.ai, ChatGPT and other remote MCP clients can use this API's tools. Every request stands
 * alone (no session kept here). The person signs in with their token; the tools act as an agent
 * for them ("Louise via Claude", review-only unless their token allows more) and call this API
 * itself, so its permissions, plan limits and quotas apply as to any other call.
 */
import type { Request, Response, RequestHandler } from 'express';
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, parseOptions, withPluginCommands, type ServerOptions } from '@moteurio/mcp';
import { listPluginCommands } from '@moteurio/core';
import { createMoteurAdminClient } from '@moteurio/client';
import { generateSessionToken, verifyJWT } from '@moteurio/core/auth.js';
import { getUserById } from '@moteurio/core/users.js';
import type { OpenAPIV3 } from 'openapi-types';
import { requireAuth } from '../middlewares/auth.js';
import { scopedServerOptions, restrictClient, type McpConnection } from './access.js';

/** Who the client is, from its User-Agent, until OAuth gives each client its own name. */
export function agentFromUserAgent(ua: string | undefined): string {
    const s = ua ?? '';
    if (/claude[- ]code/i.test(s)) return 'Claude Code';
    if (/claude/i.test(s)) return 'Claude';
    if (/chatgpt|openai/i.test(s)) return 'ChatGPT';
    if (/cursor/i.test(s)) return 'Cursor';
    return 'an AI agent';
}

/** `?groups=entries,media&readOnly=1&compact=1&project=demo` as the stdio server's flags. */
export function optionsFromQuery(query: Request['query']): ServerOptions {
    const argv: string[] = [];
    const yes = (k: string) => ['1', 'true', 'yes'].includes(String(query[k] ?? '').toLowerCase());
    if (yes('readOnly')) argv.push('--read-only');
    if (yes('allowDestructive')) argv.push('--allow-destructive');
    if (yes('compact')) argv.push('--compact');
    if (yes('all')) argv.push('--all');
    if (typeof query.groups === 'string') argv.push('--groups', query.groups);
    const { groups, readOnly, allowDestructive, compact } = parseOptions(argv);
    return {
        groups,
        readOnly,
        allowDestructive,
        compact,
        ...(typeof query.project === 'string' ? { project: query.project } : {})
    };
}

/** The tools for the signed-in person, calling the API at `self` (whose routes `spec` lists). */
export function mcpRouter(
    self: () => string,
    spec?: OpenAPIV3.Document,
    authenticate: RequestHandler = requireAuth
): Router {
    const router = Router();

    router.post('/', authenticate, async (req: Request, res: Response) => {
        const person = req.user!;
        const account = getUserById(person.id);
        if (!account) return void res.status(401).json({ error: 'Invalid or expired token' });
        // A token already given to an agent keeps its agent; a person's token acts as one, review-only.
        const agent = person.agent ?? {
            name: agentFromUserAgent(req.get('user-agent')),
            reviewOnly: true
        };
        const connection = res.locals.mcpConnection as McpConnection | undefined;
        // OAuth authentication already checked its opaque token; JWT sessions retain ancestry.
        const payload = connection
            ? undefined
            : verifyJWT(req.headers.authorization!.replace(/^Bearer\s+/i, ''));
        const token = generateSessionToken({ ...account, agent }, 60 * 60, payload);
        const client = createMoteurAdminClient({
            baseURL: self(),
            auth: { type: 'bearer', token }
        });
        const options = optionsFromQuery(req.query);
        if (connection) restrictClient(client, connection);
        const commands = withPluginCommands(listPluginCommands({ surface: 'mcp' }));
        const server = createServer({
            ...options,
            // The disk here is the server's: no tool reads or writes paths a caller gives.
            local: false,
            commands,
            ...(connection ? scopedServerOptions(connection, options.project, commands) : {}),
            routes: spec ? async () => spec : false,
            session: body => ({
                local: false,
                client: async () => client,
                defaultProject: async () => options.project,
                body: async () => body
            })
        });
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            console.error('[mcp]', err);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal error' },
                    id: null
                });
            }
        }
    });

    // No server-sent stream or session to end: each POST stands alone.
    const notHere = (_req: Request, res: Response) =>
        void res
            .status(405)
            .set('Allow', 'POST')
            .json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Method not allowed.' },
                id: null
            });
    router.get('/', notHere);
    router.delete('/', notHere);

    return router;
}

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/mcp': {
        post: {
            summary: 'Moteur for AI agents: the Model Context Protocol (Streamable HTTP)',
            description:
                'A tool for everything the API can do, for remote MCP clients. The tools act as an agent for the signed-in person: changes read “<name> via <agent>”, are marked until a person reads them, and go live only once a person approves them (unless the token was given to an agent with reviewOnly false, see POST /auth/session-token). Query: groups (comma-separated), readOnly, allowDestructive, all, compact, project. A notification (a message without an id) is answered 202 with no body.',
            tags: ['MCP'],
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { type: 'object', description: 'A JSON-RPC message' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'The JSON-RPC answer',
                    content: { 'application/json': { schema: { type: 'object' } } }
                },
                '401': { description: 'Not signed in' }
            }
        }
    }
};
