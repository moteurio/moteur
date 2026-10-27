import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { typesDiff } from '../src/commands/project.js';
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

describe('entries update --set', () => {
    const update = API_COMMANDS.find(c => c.group === 'entries' && c.name === 'update')!;

    it('changes one language of a field and keeps the others', async () => {
        const sent: unknown[] = [];
        const client = {
            get: async () => ({
                entry: {
                    data: {
                        title: { fr: 'Sous la glace', en: 'Below the ice' },
                        slug: { fr: 'sous-la-glace', en: 'below-the-ice' }
                    }
                }
            }),
            patch: async (_url: string, body: unknown) => sent.push(body)
        };
        await execute(
            update,
            { model: 'article', id: 'glace', set: ['title.en=Under the ice'] },
            { client: async () => client as never, defaultProject: async () => 'demo' }
        );
        expect(sent).toEqual([{ data: { title: { fr: 'Sous la glace', en: 'Under the ice' } } }]);
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

describe('types --check', () => {
    const typesCmd = API_COMMANDS.find(c => c.group === 'types')!;
    const current =
        'export type Locale = "en";\n\nexport interface HeroBlock {\n    heading: string;\n}\n';
    const session = {
        client: async () => ({ request: async () => current }) as never,
        defaultProject: async () => 'demo'
    };
    const file = (text?: string) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-types-'));
        const out = path.join(dir, 'moteur.ts');
        if (text !== undefined) fs.writeFileSync(out, text);
        return out;
    };

    it('passes when the file matches the project, and writes nothing', async () => {
        const out = file(current);
        await expect(execute(typesCmd, { out, check: true }, session)).resolves.toMatch(
            /up to date/
        );
    });

    it('fails with what changed when the file is out of date', async () => {
        const out = file(
            'export type Locale = "en";\n\nexport interface HeroBlock {\n    title: string;\n}\n\nexport type OldBlock = {};\n'
        );
        const run = execute(typesCmd, { out, check: true }, session);
        await expect(run).rejects.toThrow(/out of date:\n {2}~ HeroBlock\n {2}- OldBlock/);
        expect(fs.readFileSync(out, 'utf8')).toContain('title: string');
    });

    it('fails when the file is missing, and needs --out', async () => {
        await expect(execute(typesCmd, { out: file(), check: true }, session)).rejects.toThrow(
            /doesn’t exist/
        );
        await expect(execute(typesCmd, { check: true }, session)).rejects.toThrow(/needs --out/);
    });
});

describe('typesDiff', () => {
    it('lists added, changed and removed types', () => {
        expect(
            typesDiff(
                'export type A = 1;\nexport type B = 2;\n',
                'export type A = 1;\nexport type B = 3;\nexport type C = 4;\n'
            )
        ).toEqual(['~ B', '+ C']);
    });
});
