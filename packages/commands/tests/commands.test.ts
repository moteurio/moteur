import { describe, it, expect } from 'vitest';
import {
    API_COMMANDS,
    Commands,
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
