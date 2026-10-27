import { describe, it, expect } from 'vitest';
import { openApiSchemaForModelField } from '../../src/openapi/modelFieldOpenApi.js';

describe('openApiSchemaForModelField', () => {
    it('describes a variant as one shape per kind, told apart by kind', () => {
        const schema = openApiSchemaForModelField(
            {
                type: 'core/variant',
                label: 'Exhibit',
                options: {
                    variants: {
                        image: {
                            label: 'Image',
                            fields: { src: { type: 'core/text', label: 'Src' } }
                        },
                        code: {
                            label: 'Code',
                            fields: { code: { type: 'core/textarea', label: 'Code' } }
                        }
                    }
                }
            },
            0
        );
        expect(schema.discriminator).toEqual({ propertyName: 'kind' });
        expect(schema.oneOf).toHaveLength(2);
        expect((schema.oneOf![0] as any).properties.kind).toEqual({
            type: 'string',
            enum: ['image']
        });
        expect(Object.keys((schema.oneOf![1] as any).properties)).toEqual(['kind', 'code']);
    });

    it('describes page relations as page summaries', () => {
        const many = openApiSchemaForModelField(
            { type: 'core/relations', label: 'Related', options: { target: 'pages' } },
            0
        );
        expect(many.type).toBe('array');
        expect((many.items as any).required).toEqual(['id', 'label', 'url']);
        const one = openApiSchemaForModelField(
            { type: 'core/relation', label: 'Next', options: { target: 'pages' } },
            0
        );
        expect(one.nullable).toBe(true);
    });

    it('describes a link with its page', () => {
        const schema = openApiSchemaForModelField({ type: 'core/link', label: 'Link' }, 0);
        expect(Object.keys(schema.properties!)).toEqual([
            'url',
            'pageId',
            'missing',
            'label',
            'ariaLabel'
        ]);
    });
});
