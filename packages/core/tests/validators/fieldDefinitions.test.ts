import { describe, expect, it } from 'vitest';
import '../../src/fields/index.js';
import {
    assertFieldDefinitions,
    fieldDefinitionIssues
} from '../../src/validators/fieldDefinitions.js';
import { builtinBlockSchemas, builtinStructureSchemas } from '../../src/plugins/builtinContent.js';

describe('field definitions, when a schema is saved', () => {
    it('refuses an option the field’s type doesn’t have, naming the one meant', () => {
        const issues = fieldDefinitionIssues({
            body: { type: 'core/block-list', options: { allowedBlocks: ['site/hero'] } }
        });
        expect(issues).toEqual([
            expect.objectContaining({
                code: 'FIELD_OPTION_UNKNOWN',
                path: 'fields.body.options.allowedBlocks',
                message: expect.stringContaining('did you mean "allowedBlockTypes"?')
            })
        ]);
        expect(() =>
            assertFieldDefinitions(
                { body: { type: 'core/block-list', options: { allowedBlocks: [] } } },
                'Template "page"'
            )
        ).toThrow(expect.objectContaining({ status: 400, code: 'FIELD_OPTION_UNKNOWN' }));
    });

    it('lists the type’s options when nothing is close', () => {
        const [issue] = fieldDefinitionIssues({
            n: { type: 'core/number', options: { colour: 'red' } }
        });
        expect(issue!.message).toMatch(/has no option "colour" \(its options: /);
    });

    it('takes required, multilingual and ui on every field', () => {
        expect(
            fieldDefinitionIssues({
                when: {
                    type: 'core/date',
                    options: { required: true, multilingual: false, ui: 'x' }
                }
            })
        ).toEqual([]);
    });

    it('looks inside objects, lists and variants', () => {
        const issues = fieldDefinitionIssues({
            card: {
                type: 'core/object',
                fields: {
                    links: {
                        type: 'core/list',
                        items: { type: 'core/text', options: { maxLenght: 3 } }
                    }
                }
            },
            shot: {
                type: 'core/variant',
                options: {
                    variants: {
                        image: {
                            fields: { picture: { type: 'core/asset', options: { ratio: '1:1' } } }
                        }
                    }
                }
            }
        });
        expect(issues.map(i => i.path)).toEqual([
            'fields.card.fields.links.items.options.maxLenght',
            'fields.shot.options.variants.image.fields.picture.options.ratio'
        ]);
    });

    it('leaves a type this server doesn’t have alone (a plugin’s)', () => {
        expect(
            fieldDefinitionIssues({ spot: { type: 'geo/location', options: { anything: 1 } } })
        ).toEqual([]);
    });

    it('passes every block and structure the engine ships', () => {
        for (const schema of [...builtinBlockSchemas, ...builtinStructureSchemas])
            expect(fieldDefinitionIssues(schema.fields as never), schema.type).toEqual([]);
    });
});
