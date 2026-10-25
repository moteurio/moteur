import { TextEncoder } from 'node:util';
import { describe, expect, it, beforeEach } from 'vitest';
import { wrapPluginContext, createPluginContext } from '../../src/plugins/pluginContext.js';
import { ContributionCollector } from '../../src/plugins/contributionCollector.js';
import { listPluginCommands, resetPluginCommands } from '../../src/plugins/commandRegistry.js';
import {
    applyMediaTransforms,
    listMediaGenerators,
    resetMediaPipeline,
    runMediaGenerator
} from '../../src/plugins/mediaPipeline.js';
import { listModelTemplates, resetModelTemplates } from '../../src/plugins/modelTemplates.js';
import { registerHostPlugins } from '../../src/plugins/registerCorePlugins.js';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

describe('plugin extension hooks', () => {
    beforeEach(() => {
        resetPluginCommands();
        resetMediaPipeline();
        resetModelTemplates();
    });

    it('records commands, media and model templates on init', async () => {
        const plugin: HostPluginModule = {
            manifest: {
                id: 'ext-test',
                label: 'Ext',
                source: 'private',
                scope: 'project'
            },
            init(ctx) {
                ctx.registerCommand({
                    group: 'play',
                    name: 'demo',
                    summary: 'Demo',
                    http: 'GET /projects/{project}/play/demo',
                    readOnly: true
                });
                ctx.registerMcpTool({
                    group: 'play',
                    name: 'secret',
                    summary: 'MCP only'
                });
                ctx.registerMediaGenerator({
                    id: 'demo-svg',
                    label: 'Demo',
                    mimeType: 'image/svg+xml',
                    generate: () => ({
                        bytes: new TextEncoder().encode('<svg/>'),
                        filename: 'x.svg',
                        mimeType: 'image/svg+xml'
                    })
                });
                ctx.registerMediaTransform({
                    id: 'passthrough',
                    label: 'Passthrough',
                    apply: bytes => bytes
                });
                ctx.registerModelTemplate({
                    id: 'demo',
                    label: 'Demo',
                    fields: {}
                });
            }
        };
        await registerHostPlugins([plugin]);
        expect(listPluginCommands().map(c => `${c.group} ${c.name}`)).toEqual(
            expect.arrayContaining(['play demo', 'play secret'])
        );
        expect(listPluginCommands({ surface: 'mcp' }).map(c => c.name)).toEqual(
            expect.arrayContaining(['demo', 'secret'])
        );
        expect(listPluginCommands({ surface: 'cli' }).map(c => c.name)).toEqual(['demo']);
        const svg = await runMediaGenerator('demo-svg', { projectId: 'p', params: {} });
        expect(svg.mimeType).toBe('image/svg+xml');
        expect(listModelTemplates().map(m => m.id)).toContain('demo');
        expect(listMediaGenerators().map(g => g.id)).toContain('demo-svg');
    });

    it('applies source transforms', async () => {
        const ctx = wrapPluginContext(createPluginContext(), new ContributionCollector(), 't');
        ctx.registerMediaTransform({
            id: 'mark',
            label: 'Mark',
            apply: bytes => {
                const out = new Uint8Array(bytes.length + 1);
                out.set(bytes);
                out[bytes.length] = 1;
                return out;
            }
        });
        const result = await applyMediaTransforms(
            new Uint8Array([0]),
            { mimeType: 'image/png' },
            'source'
        );
        expect([...result]).toEqual([0, 1]);
    });
});
