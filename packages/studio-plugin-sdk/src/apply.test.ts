import { describe, expect, it } from 'vitest';
import { applyStudioPlugins, defineStudioPlugin } from './apply.js';
import { getStudioPluginContributions } from './contributions.js';
import type { StudioHostAdapter } from './types.js';

describe('applyStudioPlugins', () => {
    it('registers field editors and merges declared + derived contributions', () => {
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
            manifest: {
                id: 'test',
                label: 'Test',
                source: 'opensource',
                scope: 'project',
                categories: ['content'],
                contributes: {
                    studioUi: { fieldEditors: ['play/test'] }
                }
            },
            register(ctx) {
                ctx.registerFieldEditor('play/test', () => null as any);
            }
        });
        applyStudioPlugins([mod], host);
        expect(fields).toEqual(['play/test']);
        expect(getStudioPluginContributions('test')).toEqual({
            studioUi: { fieldEditors: ['play/test'] }
        });
    });
});
