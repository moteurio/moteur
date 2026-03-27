import { describe, it, expect } from 'vitest';
import { createPluginContext } from '../../src/plugins/pluginContext.js';
import fieldRegistry from '../../src/registry/FieldRegistry.js';

describe('pluginContext', () => {
    it('can register field schemas from plugins', () => {
        const ctx = createPluginContext();
        const type = `test/plugin-field-${Date.now()}`;
        expect(fieldRegistry.has(type)).toBe(false);

        ctx.registerFieldSchema({
            type,
            label: 'Plugin Test Field',
            description: 'Field registered through plugin context',
            fields: {
                value: { type: 'core/text', label: 'Value' }
            }
        });

        expect(fieldRegistry.has(type)).toBe(true);
    });
});
