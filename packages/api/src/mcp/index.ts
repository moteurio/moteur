/**
 * Hosted MCP server: `POST /mcp` speaks the Model Context Protocol (Streamable HTTP), so remote MCP
 * clients such as claude.ai and ChatGPT can use this API's tools. Every request is self-contained
 * and no session is kept. The user authenticates with their token, and the tools act as an agent on
 * the user's behalf (for example "Louise via Claude"), restricted to review unless the token allows
 * more. The tools call this API itself, so its permissions, plan limits and quotas apply exactly as
 * they do for any other call.
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

/** Guesses the client's name from its User-Agent. Used until OAuth supplies a name for each client. */
export function agentFromUserAgent(ua: string | undefined): string {
    const s = ua ?? '';
    if (/claude[- ]code/i.test(s)) return 'Claude Code';
    if (/claude/i.test(s)) return 'Claude';
    if (/chatgpt|openai/i.test(s)) return 'ChatGPT';
    if (/cursor/i.test(s)) return 'Cursor';
    return 'an AI agent';
}

/** Converts query parameters such as `?groups=entries,media&readOnly=1&compact=1&project=demo` into the options of the stdio MCP server. */
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

/** Creates the MCP router. Its tools act for the signed-in user and call this API at `self`; `spec` lists the API's routes. */
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
        // A token already issued to an agent keeps that agent. A user's own token acts as an agent restricted to review.
        const agent = person.agent ?? {
            name: agentFromUserAgent(req.get('user-agent')),
            reviewOnly: true
        };
        const connection = res.locals.mcpConnection as McpConnection | undefined;
        // OAuth authentication has already validated its opaque token. For JWT sessions, pass the original payload so the new token is tied to the session it derives from.
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
            // The local disk belongs to the server, so no tool may read or write paths supplied by the caller.
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

    // There is no server-sent stream or session to close, because each POST is self-contained.
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

/** The transport defines GET and DELETE, so clients try them. Each POST stands alone, so both answer 405. */
function notAllowedSpec(method: 'GET' | 'DELETE'): OpenAPIV3.OperationObject {
    return {
        summary: `${method} is not used: send every message with POST`,
        description:
            method === 'GET'
                ? 'Moteur does not open a server-sent stream. The answer is a JSON-RPC error with the Allow header set to POST.'
                : 'There is no session to end, because each POST stands alone. The answer is a JSON-RPC error with the Allow header set to POST.',
        tags: ['MCP'],
        security: [],
        responses: {
            '405': {
                description: 'Method not allowed',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                jsonrpc: { type: 'string', enum: ['2.0'] },
                                error: {
                                    type: 'object',
                                    properties: {
                                        code: { type: 'integer' },
                                        message: { type: 'string' }
                                    }
                                },
                                id: { type: 'string', nullable: true }
                            }
                        }
                    }
                }
            }
        }
    };
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
        },
        get: notAllowedSpec('GET'),
        delete: notAllowedSpec('DELETE')
    }
};
