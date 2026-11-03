import { describe, expect, it } from 'vitest';
import '../src/fields/index.js';
import fieldRegistry from '../src/registry/FieldRegistry.js';
import { EXAMPLE_STRUCTURES, FIELD_EXAMPLES } from '../src/agentGuide/fieldExamples.js';
import { fieldDefinitionIssues } from '../src/validators/fieldDefinitions.js';
import { validateModel } from '../src/validators/validateModel.js';
import { validateFieldValue } from '../src/validators/validateFieldValue.js';
import { FIELD_GROUPS, fieldReference } from '../src/agentGuide/fieldReference.js';
import fs from 'fs';
import path from 'path';

const REFERENCE = path.resolve(import.meta.dirname, '../../../skills/moteur/references/fields.md');

const errors = (issues: { type: string; path?: string; message: string }[]) =>
    issues.filter(i => i.type === 'error').map(i => `${i.path}: ${i.message}`);

describe('the skill’s field examples', () => {
    it('cover every field type, and only those', () => {
        expect(Object.keys(FIELD_EXAMPLES).sort()).toEqual(Object.keys(fieldRegistry.all()).sort());
    });

    for (const [type, { field, value }] of Object.entries(FIELD_EXAMPLES)) {
        it(`${type}: a definition a schema takes, and a value it accepts`, () => {
            expect(field.type).toBe(type);
            expect(errors(fieldDefinitionIssues({ f: field } as never))).toEqual([]);
            expect(
                errors(
                    validateModel({
                        id: 'example',
                        label: 'Example',
                        fields: { f: field }
                    } as never).issues
                )
            ).toEqual([]);
            expect(
                errors(
                    validateFieldValue(value, field, 'f', {
                        structures: EXAMPLE_STRUCTURES as never
                    })
                )
            ).toEqual([]);
        });
    }

    it('are each in one group of the reference', () => {
        const grouped = FIELD_GROUPS.flatMap(([, types]) => types);
        expect(grouped.sort()).toEqual(Object.keys(FIELD_EXAMPLES).sort());
    });

    it('write the skill’s field reference, which is up to date', () => {
        const written = fieldReference();
        if (process.env.UPDATE_SKILL) fs.writeFileSync(REFERENCE, written);
        expect(fs.readFileSync(REFERENCE, 'utf8')).toBe(written);
    });

    it('link only to files the skill has', () => {
        const skill = path.dirname(path.dirname(REFERENCE));
        const files = ['SKILL.md', 'references/bundle.md', 'references/site.md'];
        for (const file of files) {
            const text = fs.readFileSync(path.join(skill, file), 'utf8');
            for (const [, target] of text.matchAll(/\]\((?![a-z]+:|#)([^)#\s]+)/g))
                expect(
                    fs.existsSync(path.resolve(path.dirname(path.join(skill, file)), target!)),
                    `${file} → ${target}`
                ).toBe(true);
        }
    });
});
