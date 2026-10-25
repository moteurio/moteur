import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMoteurAdminClient } from '@moteurio/client';
import { API_COMMANDS, createServer } from '@moteurio/mcp';
import {
    permitsCommand,
    restrictClient,
    scopedServerOptions,
    type McpConnection,
    type McpAccessPolicy
} from '../../src/mcp/access.js';

function setup(level: McpAccessPolicy['level'] = 'content') {
    let policy: McpAccessPolicy = { level, projectIds: ['demo'], allowCreateProjects: false };
    let revoked = false;
    const created = vi.fn(async (id: string) => {
        policy = { ...policy, projectIds: [...policy.projectIds, id] };
    });
    const connection: McpConnection = {
        current: () => {
            if (revoked) throw new Error('Disconnected');
            return policy;
        },
        created
    };
    const api = createMoteurAdminClient({
        baseURL: 'https://api.example.com/v1',
        auth: { type: 'bearer', token: 'private-api-token' }
    });
    const send = vi.fn(async (config: any) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data:
            config.url === '/projects' && config.method === 'get'
                ? { projects: [{ id: 'demo' }, { id: 'other' }] }
                : config.url === '/auth/me'
                  ? { user: { id: 'louise', projects: ['demo', 'other'] } }
                  : config.url === '/projects'
                    ? { id: 'new-project' }
                    : { entries: [], total: 0 }
    }));
    api._raw.defaults.adapter = send;
    restrictClient(api, connection);
    return {
        api,
        send,
        connection,
        created,
        setPolicy: (value: McpAccessPolicy) => {
            policy = value;
        },
        revoke: () => {
            revoked = true;
        }
    };
}

async function connect(fixture: ReturnType<typeof setup>, compact = false) {
    const server = createServer({
        ...scopedServerOptions(fixture.connection, 'demo'),
        compact,
        allowDestructive: true,
        routes: false,
        session: body => ({
            client: async () => fixture.api,
            defaultProject: async () => 'demo',
            body: async () => body
        })
    });
    const client = new Client({ name: 'permission-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}

describe('MCP project and access boundaries', () => {
    it('applies consent restrictions to plugin commands as well as built-ins', () => {
        const fixture = setup('developer');
        const plugin = {
            group: 'custom',
            name: 'inspect',
            summary: 'Inspect plugin content',
            readOnly: true,
            http: 'GET /projects/{project}/custom',
            args: [{ name: 'project', type: 'string' }]
        } as (typeof API_COMMANDS)[number];
        const scoped = scopedServerOptions(fixture.connection, 'demo', [...API_COMMANDS, plugin]);
        expect(scoped.commands).toContainEqual(plugin);
        expect(() => scoped.beforeRun!(plugin, { project: 'other' })).toThrow(
            'This project was not granted'
        );
        fixture.setPolicy({ level: 'read', projectIds: ['demo'], allowCreateProjects: false });
        expect(() => scoped.beforeRun!(plugin, { project: 'demo' })).toThrow(
            'outside the connection'
        );
    });

    it('filters project discovery and identity to the explicitly granted projects', async () => {
        const { api } = setup();
        expect((await api.projects.list()).projects).toEqual([{ id: 'demo' }]);
        expect((await api.auth.me()).user.projects).toEqual(['demo']);
    });

    it('refuses unselected projects, traversal, absolute addresses and credential minting before any API call', async () => {
        const { api, send } = setup('developer');
        for (const url of [
            '/projects/other/models',
            '/projects/demo/../other/models',
            '/projects/demo%2f..%2fother/models',
            'https://evil.example/projects/demo',
            '//evil.example/projects/demo',
            '/auth/session-token',
            '/operator/users',
            '/activity'
        ]) {
            await expect(api.get(url)).rejects.toThrow();
        }
        await expect(
            api.request({ url: '/projects/demo', baseURL: 'https://evil.example' })
        ).rejects.toThrow();
        expect(send).not.toHaveBeenCalled();
    });

    it('enforces read-only and content restrictions at the API request boundary', async () => {
        const read = setup('read');
        await expect(
            read.api.patch('/projects/demo/models/article/entries/a', { data: {} })
        ).rejects.toThrow('read-only');
        expect(read.send).not.toHaveBeenCalled();
        const content = setup('content');
        await content.api.patch('/projects/demo/models/article/entries/a', {
            data: { title: 'Hello' }
        });
        await content.api.post('/projects/demo/assets/batch', { action: 'update', ids: ['a'] });
        for (const url of [
            '/projects/demo/models/article',
            '/projects/demo/users',
            '/projects/demo/api-keys',
            '/projects/demo/webhooks'
        ]) {
            await expect(content.api.patch(url, {})).rejects.toThrow();
        }
        await expect(content.api.get('/projects/demo/api-keys')).rejects.toThrow();
        expect(content.send).toHaveBeenCalledTimes(2);
    });

    it('allows schema changes only with developer access, still scoped to the project', async () => {
        const { api, send } = setup('developer');
        await api.patch('/projects/demo/models/article', { fields: [] });
        await expect(api.patch('/projects/other/models/article', {})).rejects.toThrow();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('checks body-bound AI project IDs and refuses AI actions for read-only connections', async () => {
        const { api, send } = setup('content');
        await api.post('/ai/write', { projectId: 'demo', text: 'Hello' });
        await expect(api.post('/ai/write', { projectId: 'other' })).rejects.toThrow();
        await expect(api.post('/ai/settings', { projectId: 'demo' })).rejects.toThrow();
        expect(send).toHaveBeenCalledTimes(1);
        const read = setup('read');
        await expect(read.api.post('/ai/write', { projectId: 'demo' })).rejects.toThrow();
        expect(read.send).not.toHaveBeenCalled();
    });

    it('requires explicit creation consent and adds only the project actually created', async () => {
        const fixture = setup('developer');
        await expect(fixture.api.post('/projects', { id: 'new-project' })).rejects.toThrow();
        fixture.setPolicy({ level: 'developer', projectIds: [], allowCreateProjects: true });
        await fixture.api.post('/projects', { id: 'new-project' });
        expect(fixture.created).toHaveBeenCalledWith('new-project');
        await fixture.api.get('/projects/new-project/models');
        await expect(fixture.api.get('/projects/other/models')).rejects.toThrow();
    });

    it('rechecks edits and revocation on a client that is already connected', async () => {
        const fixture = setup('developer');
        await fixture.api.patch('/projects/demo/models/article', {});
        fixture.setPolicy({ level: 'read', projectIds: ['demo'], allowCreateProjects: false });
        await expect(fixture.api.patch('/projects/demo/models/article', {})).rejects.toThrow();
        fixture.revoke();
        await expect(fixture.api.get('/projects/demo/models')).rejects.toThrow('Disconnected');
        expect(fixture.send).toHaveBeenCalledTimes(1);
    });

    it('offers content inspection without schema mutations, tokens, raw calls or server filesystem tools', () => {
        const fixture = setup('content');
        const names = API_COMMANDS.filter(c => permitsCommand(fixture.connection.current(), c)).map(
            c => `${c.group} ${c.name}`
        );
        expect(names).toContain('entries update');
        expect(names).toContain('models list');
        for (const name of [
            'models create',
            'keys list',
            'members list',
            'api ',
            'auth agent-token',
            'media upload',
            'media replace',
            'status '
        ])
            expect(names).not.toContain(name);
        const read = setup('read');
        expect(
            API_COMMANDS.filter(c => permitsCommand(read.connection.current(), c)).every(
                c => c.readOnly
            )
        ).toBe(true);
    });

    it.each([false, true])(
        'enforces policy on actual MCP tool calls (compact=%s)',
        async compact => {
            const fixture = setup('content');
            const client = await connect(fixture, compact);
            const call = (name: string, args: Record<string, unknown>) =>
                compact
                    ? client.callTool({
                          name: 'moteur_run',
                          arguments: { command: name, arguments: args }
                      })
                    : client.callTool({ name, arguments: args });
            const list = await call('projects_list', {});
            expect(JSON.stringify(list)).not.toContain('other');
            const afterList = fixture.send.mock.calls.length;
            const rejected = await call('entries_list', { project: 'other', model: 'article' });
            expect(rejected.isError).toBe(true);
            expect(fixture.send).toHaveBeenCalledTimes(afterList);
            const updated = await call('entries_update', {
                project: 'demo',
                model: 'article',
                id: 'a',
                set: ['title.en=Hello']
            });
            expect(updated.isError).toBeFalsy();
            expect(fixture.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'patch',
                    url: '/projects/demo/models/article/entries/a'
                })
            );
            const afterUpdate = fixture.send.mock.calls.length;
            fixture.setPolicy({ level: 'read', projectIds: ['demo'], allowCreateProjects: false });
            const tightened = await call('entries_update', {
                project: 'demo',
                model: 'article',
                id: 'a',
                set: ['title.en=No']
            });
            expect(tightened.isError).toBe(true);
            const schema = await call('models_create', {
                project: 'demo',
                model: 'article',
                body: {}
            });
            expect(schema.isError).toBe(true);
            expect(fixture.send).toHaveBeenCalledTimes(afterUpdate);
            await client.close();
        }
    );
});
