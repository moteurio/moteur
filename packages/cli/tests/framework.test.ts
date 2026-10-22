import { describe, it, expect } from 'vitest';
import { UsageError, project, type CommandSpec } from '@moteurio/commands';
import { parseArgv } from '../src/framework/argv.js';
import { readArgs } from '../src/framework/run.js';
import { commandHelp } from '../src/framework/help.js';
import { commands } from '../src/commands/index.js';

const spec = (over: Partial<CommandSpec> = {}): CommandSpec => ({
    group: 'entries',
    name: 'list',
    summary: 'List',
    args: [
        project,
        {
            name: 'model',
            description: 'Model',
            required: true,
            positional: 0,
            aliases: ['modelId']
        },
        { name: 'limit', type: 'number', description: 'How many', default: 50 },
        { name: 'status', type: 'list', description: 'States' },
        { name: 'published', type: 'boolean', description: 'Only live' },
        { name: 'sort', description: 'Order', choices: ['asc', 'desc'] }
    ],
    ...over
});

describe('argv', () => {
    it('reads --k v, --k=v, --no-k, short flags and words', () => {
        const { words, flags } = parseArgv([
            'article',
            '--limit',
            '5',
            '--sort=asc',
            '--no-published',
            '-y',
            '--json',
            'extra'
        ]);
        expect(words).toEqual(['article', 'extra']);
        expect(flags).toEqual({ limit: '5', sort: 'asc', published: false, yes: true, json: true });
    });

    it('collects repeated flags', () => {
        expect(parseArgv(['--filter', 'a=1', '--filter', 'b=2']).flags.filter).toEqual([
            'a=1',
            'b=2'
        ]);
    });
});

describe('arguments', () => {
    it('converts, fills defaults, and takes positionals and old spellings', () => {
        expect(readArgs(spec(), ['article', '--status', 'draft,published', '--published'])).toEqual(
            {
                model: 'article',
                status: ['draft', 'published'],
                published: true,
                limit: 50
            }
        );
        expect(readArgs(spec(), ['--modelId=article', '--limit', '3']).limit).toBe(3);
    });

    it('says what is wrong, with a suggestion', () => {
        expect(() => readArgs(spec(), [])).toThrow(/--model is required/);
        expect(() => readArgs(spec(), ['article', '--limt', '3'])).toThrow(/did you mean --limit/);
        expect(() => readArgs(spec(), ['article', '--limit', 'many'])).toThrow(UsageError);
        expect(() => readArgs(spec(), ['article', '--sort', 'sideways'])).toThrow(/asc, desc/);
        expect(() => readArgs(spec(), ['article', 'surplus'])).toThrow(/Unexpected "surplus"/);
    });

    it('lets a positional list take every word left', () => {
        const upload = spec({
            args: [{ name: 'files', type: 'list', description: 'Files', positional: 0 }]
        });
        expect(readArgs(upload, ['a.jpg', 'b.jpg']).files).toEqual(['a.jpg', 'b.jpg']);
    });
});

describe('help', () => {
    it('write help from the declaration', () => {
        const help = commandHelp({
            ...spec(),
            http: 'GET /projects/{project}/models/{model}/entries'
        });
        expect(help).toContain('Usage: moteur entries list <model> [options]');
        expect(help).toContain('--limit <number>');
        expect(help).toContain('Calls: GET /projects/{project}/models/{model}/entries');
    });
});

describe('the command line', () => {
    it('has the API commands, plus signing in and checks', () => {
        expect(commands.find('auth', 'login')).toBeDefined();
        expect(commands.find('doctor', '')).toBeDefined();
        expect(commands.find('entries', 'publish')?.http).toContain('/publish');
    });
});
