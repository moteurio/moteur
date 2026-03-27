import { describe, expectTypeOf, test } from 'vitest';
import type { BlueprintSchema } from '../src/Blueprint.js';
import type { PageNode, StaticPage } from '../src/Page.js';

describe('PageNode discriminated union', () => {
    test('static page narrows by type', () => {
        const node = {} as PageNode;
        if (node.type === 'static') {
            expectTypeOf(node).toEqualTypeOf<StaticPage>();
            expectTypeOf(node.templateId).toBeString();
        }
    });
});

describe('BlueprintSchema', () => {
    test('model kind exposes template.model after narrowing', () => {
        const bp: BlueprintSchema = {
            id: 'm1',
            name: 'Model tpl',
            kind: 'model',
            template: { model: { id: 'post', label: 'Post', fields: {} } }
        };
        expectTypeOf(bp).toMatchTypeOf<BlueprintSchema>();
        if (bp.kind === 'model' && bp.template && 'model' in bp.template) {
            expectTypeOf(bp.template.model.id).toBeString();
            expectTypeOf(bp.template.model.fields).toBeObject();
        }
    });
});
