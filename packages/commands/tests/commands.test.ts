import { describe, it, expect } from 'vitest';
import {
    API_COMMANDS,
    Commands,
    available,
    execute,
    NotOnServer,
    checkArgs,
    coverage,
    crud,
    fillPath,
    normalize,
    revisions,
    setPairs,
    UsageError
} from '../src/index.js';

describe('arguments', () => {
    it('fills paths, and needs every placeholder', () => {
        expect(fillPath('/projects/{project}/models/{model}', { model: 'a b' }, 'demo')).toBe(
            '/projects/demo/models/a%20b'
        );
        expect(() => fillPath('/x/{id}', {})).toThrow(/--id is required/);
    });

    it('reads --set pairs as nested fields, values as JSON when they are', () => {
        expect(setPairs(['title.en=Hello', 'readingTime=5', 'tags=["a"]'])).toEqual({
            title: { en: 'Hello' },
            readingTime: 5,
            tags: ['a']
        });
    });

    it('checks values given as an object (as tools give them)', () => {
        const specs = [
            { name: 'limit', type: 'number' as const, description: 'How many', default: 50 },
            { name: 'status', type: 'list' as const, description: 'States' },
            { name: 'model', description: 'Model', required: true, aliases: ['modelId'] }
        ];
        expect(checkArgs(specs, { modelId: 'article', status: ['draft'], limit: 3 })).toEqual({
            model: 'article',
            status: ['draft'],
            limit: 3
        });
        expect(() => checkArgs(specs, {}, { naming: a => a.name })).toThrow(/^model is required/);
        expect(() => checkArgs(specs, { model: 'a', limt: 3 }, { naming: a => a.name })).toThrow(
            /did you mean limit/
        );
        expect(() => checkArgs(specs, { model: 'a', limit: 'x' })).toThrow(UsageError);
    });
});

describe('generators', () => {
    it('make the usual commands with their calls', () => {
        const made = crud({
            noun: 'layout',
            base: '/projects/{project}/layouts',
            idName: 'layout'
        });
        expect(made.map(c => `${c.name} ${c.http}`)).toEqual([
            'list GET /projects/{project}/layouts',
            'get GET /projects/{project}/layouts/{layout}',
            'create POST /projects/{project}/layouts',
            'update PATCH /projects/{project}/layouts/{layout}',
            'delete DELETE /projects/{project}/layouts/{layout}'
        ]);
        expect(made.find(c => c.name === 'delete')?.destructive).toBe(true);
        const history = revisions({
            noun: 'page',
            path: '/p/{id}',
            ids: [{ name: 'id', description: 'Page', positional: 0 }]
        });
        expect(
            history.find(c => c.name === 'restore')?.args?.find(a => a.name === 'revision')
                ?.positional
        ).toBe(1);
    });
});

describe('coverage', () => {
    it('finds operations without a command, and commands calling unknown routes', () => {
        const doc = {
            paths: {
                '/projects/{projectId}/layouts': { get: {}, post: {} },
                '/auth/github': { get: {} }
            }
        };
        const c = coverage(
            [
                {
                    group: 'layouts',
                    name: 'list',
                    summary: '',
                    http: 'GET /projects/{project}/layouts'
                },
                {
                    group: 'layouts',
                    name: 'typo',
                    summary: '',
                    http: 'GET /projects/{project}/layout'
                }
            ],
            doc
        );
        expect(c.covered).toEqual(['GET /projects/{x}/layouts']);
        expect(c.skipped).toEqual(['GET /auth/github']);
        expect(c.missing).toEqual(['POST /projects/{x}/layouts']);
        expect(c.unknown).toEqual([{ command: 'layouts typo', op: 'GET /projects/{x}/layout' }]);
        expect(normalize('get /projects/{projectId}/')).toBe('GET /projects/{x}');
    });
});

describe('operator commands', () => {
    const find = (g: string, n: string) => API_COMMANDS.find(c => c.group === g && c.name === n)!;

    it('are the ones calling operator-only routes', () => {
        expect(find('operator', 'summary').operator).toBe(true);
        expect(find('blueprints', 'create').operator).toBe(true);
        expect(find('search', 'reindex').operator).toBe(true);
        expect(find('blueprints', 'list').operator).toBeFalsy();
        expect(find('entries', 'list').operator).toBeFalsy();
    });

    it('run with the operator session, never the person’s', async () => {
        const calls: string[] = [];
        const client = (who: string) =>
            ({
                request: async (o: { url: string }) => calls.push(`${who} ${o.url}`),
                get: async (url: string) => calls.push(`${who} ${url}`)
            }) as never;
        const session = {
            client: async () => client('person'),
            operatorClient: async () => client('operator'),
            defaultProject: async () => 'demo'
        };
        await execute(find('operator', 'summary'), {}, session);
        await execute(find('entries', 'list'), { model: 'article' }, session);
        expect(calls).toEqual([
            'operator /operator/summary',
            'person /projects/demo/models/article/entries'
        ]);
    });
});

describe('a server without a plugin', () => {
    const ai = API_COMMANDS.find(c => c.group === 'ai' && c.http)!;

    it('is offered only the commands it has routes for', () => {
        const doc = { paths: { '/projects': { get: {} } } };
        const kept = available(API_COMMANDS, doc);
        expect(kept.some(c => c.group === 'projects' && c.name === 'list')).toBe(true);
        expect(kept.some(c => c.group === 'ai')).toBe(false);
        // Commands that call nothing stay.
        expect(kept.some(c => c.group === 'api')).toBe(true);
    });

    it('says which plugin a missing route needs', async () => {
        const missing = Object.assign(new Error('<!DOCTYPE html>'), {
            status: 404,
            response: { data: '<pre>Cannot POST /ai/status</pre>' }
        });
        const client = { request: async () => Promise.reject(missing) };
        const run = execute(
            ai,
            { project: 'demo' },
            {
                client: async () => client as never,
                defaultProject: async () => 'demo',
                body: async () => ({})
            }
        );
        await expect(run).rejects.toBeInstanceOf(NotOnServer);
        await expect(run).rejects.toThrow(/needs the AI plugin/);
    });
});

describe('the commands', () => {
    const all = API_COMMANDS;

    it('are each declared once, with a summary and a call or a run', () => {
        const seen = new Set<string>();
        for (const c of all) {
            const key = `${c.group} ${c.name}`;
            expect(seen.has(key), key).toBe(false);
            seen.add(key);
            expect(c.summary.length, key).toBeGreaterThan(3);
            expect(!!(c.http || c.run), key).toBe(true);
        }
    });

    it('have arguments for every placeholder in their call, and positionals in order', () => {
        for (const c of all) {
            const names = new Set((c.args ?? []).map(a => a.name));
            for (const [, name] of (c.http ?? '').matchAll(/\{(\w[\w-]*)\}/g)) {
                expect(
                    name === 'project' || names.has(name),
                    `${c.group} ${c.name}: {${name}}`
                ).toBe(true);
            }
            const positions = (c.args ?? [])
                .filter(a => a.positional !== undefined)
                .map(a => a.positional!)
                .sort();
            expect(positions, `${c.group} ${c.name}`).toEqual(positions.map((_, i) => i));
        }
    });

    it('find the command words name', () => {
        const registry = new Commands().add(all);
        expect(registry.resolve(['entries', 'publish', 'article']).command?.name).toBe('publish');
        expect(registry.resolve(['api', 'GET', '/x']).command?.group).toBe('api');
        expect(registry.resolve(['nope']).command).toBeUndefined();
    });
});
