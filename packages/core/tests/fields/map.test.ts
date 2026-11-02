import { describe, expect, it } from 'vitest';
import '../../src/fields/index.js';
import type { Field } from '@moteurio/types/Field.js';
import { validateFieldValue } from '../../src/validators/validateFieldValue.js';
import { walkField } from '../../src/fieldWalk.js';
import { fieldDefinitionIssues } from '../../src/validators/fieldDefinitions.js';
import { generateTypes } from '../../src/typegen.js';

const answers = {
    type: 'core/map',
    label: 'Answers',
    options: {
        keys: ['yes', { value: 'no', label: 'No' }],
        value: {
            type: 'core/object',
            label: 'Answer',
            fields: {
                ok: { type: 'core/boolean', label: 'Right' },
                text: { type: 'core/text', label: 'Says', options: { multilingual: true } }
            }
        }
    }
} as Field;

describe('a map field', () => {
    it('takes its keys to values of its field', () => {
        expect(
            validateFieldValue(
                { yes: { ok: true, text: { en: 'Right' } } },
                answers,
                'data.answers'
            )
        ).toEqual([]);
    });

    it('refuses a key it doesn’t list, and a value its field refuses', () => {
        const issues = validateFieldValue(
            { maybe: {}, no: { ok: 'nope' } },
            answers,
            'data.answers'
        );
        expect(issues.map(i => [i.code, i.path])).toEqual([
            ['MAP_UNKNOWN_KEY', 'data.answers.maybe'],
            [expect.any(String), 'data.answers.no.ok']
        ]);
        expect(validateFieldValue(['a'], answers, 'x')[0]!.code).toBe('MAP_INVALID_TYPE');
    });

    it('holds text, and any key, when it says nothing more', () => {
        const free = { type: 'core/map', label: 'Labels' } as Field;
        expect(validateFieldValue({ anything: 'words' }, free, 'x')).toEqual([]);
    });

    it('is walked into, so delivery reaches its values (languages, pictures, links)', async () => {
        const seen: string[] = [];
        await walkField(
            { yes: { ok: true, text: { en: 'Right' } } },
            answers,
            'answers',
            { structures: {}, blocks: {} } as never,
            async (_v, f, path) => {
                seen.push(`${path}:${f.type}`);
                return undefined;
            }
        );
        expect(seen).toContain('answers.yes.text:core/text');
    });

    it('has its value checked when the schema is saved', () => {
        const issues = fieldDefinitionIssues({
            m: {
                type: 'core/map',
                options: { value: { type: 'core/text', options: { maxLenght: 3 } } }
            }
        });
        expect(issues.map(i => i.path)).toEqual(['fields.m.options.value.options.maxLenght']);
    });

    it('is typed: its keys when it lists them, any key otherwise', () => {
        const out = generateTypes({
            projectId: 'p',
            defaultLocale: 'en',
            locales: ['en'],
            models: [
                {
                    id: 'quiz',
                    label: 'Quiz',
                    fields: { answers, labels: { type: 'core/map', label: 'Labels' } }
                }
            ],
            templates: [],
            blocks: {},
            structures: {}
        } as never);
        expect(out).toMatch(/answers\?: \{ yes\?: \{[\s\S]*ok\?: boolean;[\s\S]*\}; no\?: \{/);
        expect(out).toContain('labels?: Record<string, string>;');
    });
});
