import { describe, expect, it } from 'vitest';
import { applyStudioPlugins, defineStudioPlugin } from './apply.js';
import type { StudioHostAdapter } from './types.js';

describe('applyStudioPlugins', () => {
    it('registers field editors from modules', () => {
        const fields: string[] = [];
        const host: StudioHostAdapter = {
            registerFieldEditor: (type, _component) => {
                fields.push(type);
            },
            registerBlockPreview: () => {},
            registerProjectRoute: () => {},
            registerOperatorRoute: () => {}
        };
        const mod = defineStudioPlugin({
            manifest: { id: 'test' },
            register(ctx) {
                ctx.registerFieldEditor('play/test', () => null as any);
            }
        });
        applyStudioPlugins([mod], host);
        expect(fields).toEqual(['play/test']);
    });
});
