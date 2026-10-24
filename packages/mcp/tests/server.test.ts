import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { API_COMMANDS, type Session } from '@moteurio/commands';
import type { MoteurAdminClient } from '@moteurio/client';
import { createServer, type ServerOptions } from '../src/server.js';
import { inputSchema, selectCommands, toolName } from '../src/tools.js';
import { parseOptions } from '../src/options.js';

/** A fake API that records each request and answers with `answer`. */
function fakeApi(answer: unknown = { ok: true }) {
    const calls: { method: string; url: string; params?: unknown; data?: unknown }[] = [];
    const request = async (options: {
        method: string;
        url: string;
        params?: unknown;
        data?: unknown;
    }) => {
        calls.push(options);
        return answer;
    };
    const client = {
        request,
        get: (url: string, params?: unknown) => request({ method: 'GET', url, params }),
        post: (url: string, data?: unknown) => request({ method: 'POST', url, data }),
        patch: (url: string, data?: unknown) => request({ method: 'PATCH', url, data }),
        put: (url: string, data?: unknown) => request({ method: 'PUT', url, data }),
        delete: (url: string) => request({ method: 'DELETE', url })
    } as unknown as MoteurAdminClient;
    const session = (body: Record<string, unknown>): Session => ({
        client: async () => client,
        defaultProject: async () => 'demo',
        body: async () => body
    });
    return { calls, session };
}

async function connect(options: ServerOptions) {
    const server = createServer({ routes: false, ...options });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}

describe('tools', () => {
    it('are named after their command', () => {
        const find = (g: string, n: string) =>
            API_COMMANDS.find(c => c.group === g && c.name === n)!;
        expect(toolName(find('entries', 'list'))).toBe('entries_list');
        expect(toolName(find('media-settings', 'get'))).toBe('media_settings_get');
        expect(toolName(find('status', ''))).toBe('status');
        expect(toolName(find('api', ''))).toBe('api_request');
    });

    it('leave out operators, payments, raw calls, local settings, and (unless asked) what can’t be undone', () => {
        const names = selectCommands(API_COMMANDS).map(toolName);
        expect(names).toContain('entries_publish');
        expect(names).not.toContain('entries_delete');
        expect(names).not.toContain('operator_users');
        expect(names).not.toContain('api_request');
        expect(names).not.toContain('projects_use');
        expect(selectCommands(API_COMMANDS, { allowDestructive: true }).map(toolName)).toContain(
            'entries_delete'
        );
        expect(selectCommands(API_COMMANDS, { readOnly: true }).every(c => c.readOnly)).toBe(true);
        // Not even when asked: running the server takes an operator's own sign-in.
        const asked = selectCommands(API_COMMANDS, {
            groups: ['operator', 'blueprints', 'search'],
            allowDestructive: true
        });
        expect(asked.some(c => c.operator || c.group === 'operator')).toBe(false);
        expect(asked.map(toolName)).toContain('blueprints_list');
    });

    it('describe their arguments as JSON Schema', () => {
        const list = API_COMMANDS.find(c => c.group === 'entries' && c.name === 'list')!;
        const schema = inputSchema(list) as {
            properties: Record<string, { type?: string }>;
            required: string[];
        };
        expect(schema.required).toEqual(['model']);
        expect(schema.properties.limit.type).toBe('number');
        expect(schema.properties.status.type).toBe('array');
        const create = API_COMMANDS.find(c => c.group === 'templates' && c.name === 'create')!;
        expect(
            (inputSchema(create) as { properties: Record<string, unknown> }).properties.body
        ).toBeDefined();
    });

    it('read their options from the command line', () => {
        expect(
            parseOptions(['--read-only', '--groups', 'entries,media', '--project=demo'])
        ).toMatchObject({
            readOnly: true,
            groups: ['entries', 'media'],
            project: 'demo'
        });
    });
});

describe('the server', () => {
    it('lists tools with annotations', async () => {
        const client = await connect({
            session: fakeApi().session,
            groups: ['entries'],
            allowDestructive: true
        });
        const { tools } = await client.listTools();
        const list = tools.find(t => t.name === 'entries_list')!;
        expect(list.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
        expect(tools.find(t => t.name === 'entries_delete')!.annotations?.destructiveHint).toBe(
            true
        );
    });

    it('offers only the tools whose routes the server lists (no AI tools without the AI plugin)', async () => {
        const client = await connect({
            session: fakeApi().session,
            groups: ['entries', 'ai'],
            routes: async () => ({
                paths: {
                    '/projects/{projectId}/models/{modelId}/entries': { get: {} },
                    '/projects/{projectId}/models/{modelId}/entries/{entryId}': { get: {} }
                }
            })
        });
        const names = (await client.listTools()).tools.map(t => t.name);
        expect(names).toContain('entries_list');
        expect(names).toContain('entries_get');
        expect(names).not.toContain('entries_publish');
        expect(names.some(n => n.startsWith('ai_'))).toBe(false);
        const res = await client.callTool({ name: 'entries_publish', arguments: {} });
        expect(res.isError).toBe(true);
    });

    it('runs a call: path, query and body from the arguments, the default project when none', async () => {
        const api = fakeApi({ entries: [], total: 0 });
        const client = await connect({ session: api.session, groups: ['entries', 'reviews'] });
        const res = await client.callTool({
            name: 'entries_list',
            arguments: { model: 'article', q: 'glace', status: ['published'] }
        });
        expect(res.isError).toBeFalsy();
        expect(api.calls[0]).toMatchObject({
            method: 'GET',
            url: '/projects/demo/models/article/entries'
        });
        expect(api.calls[0].params).toMatchObject({ q: 'glace', status: 'published', limit: 50 });
        await client.callTool({
            name: 'reviews_reject',
            arguments: { project: 'other', id: 'r1', reason: 'Check the date' }
        });
        expect(api.calls[1]).toMatchObject({
            method: 'POST',
            url: '/projects/other/reviews/r1/reject',
            data: { reason: 'Check the date' }
        });
    });

    it('says what is wrong with the arguments, as a tool error', async () => {
        const client = await connect({ session: fakeApi().session, groups: ['entries'] });
        const missing = await client.callTool({
            name: 'entries_get',
            arguments: { model: 'article' }
        });
        expect(missing.isError).toBe(true);
        expect((missing.content as { text: string }[])[0].text).toMatch(/^id is required/);
        const typo = await client.callTool({
            name: 'entries_list',
            arguments: { model: 'a', limt: 3 }
        });
        expect((typo.content as { text: string }[])[0].text).toMatch(/did you mean limit/);
    });

    it('in compact mode, finds, describes and runs any command', async () => {
        const api = fakeApi({ ok: true });
        const client = await connect({ session: api.session, compact: true });
        expect((await client.listTools()).tools.map(t => t.name)).toEqual([
            'moteur_find',
            'moteur_describe',
            'moteur_run'
        ]);
        const found = await client.callTool({
            name: 'moteur_find',
            arguments: { query: 'publish entry' }
        });
        expect((found.content as { text: string }[])[0].text).toContain('entries_publish');
        const described = await client.callTool({
            name: 'moteur_describe',
            arguments: { command: 'entries_publish' }
        });
        expect((described.content as { text: string }[])[0].text).toContain('"model"');
        await client.callTool({
            name: 'moteur_run',
            arguments: { command: 'entries_publish', arguments: { model: 'article', id: 'glace' } }
        });
        expect(api.calls[0]).toMatchObject({
            method: 'POST',
            url: '/projects/demo/models/article/entries/glace/publish'
        });
        const refused = await client.callTool({
            name: 'moteur_run',
            arguments: { command: 'entries_delete', arguments: {} }
        });
        expect(refused.isError).toBe(true);
    });
});
