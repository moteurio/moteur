import { describe, expect, it } from 'vitest';
import { mergeContributions } from '@moteurio/types/Plugin.js';
import { registerHostPlugins } from '../../src/plugins/registerCorePlugins.js';
import { pluginRegistry } from '../../src/registry/PluginRegistry.js';
import { ContributionCollector } from '../../src/plugins/contributionCollector.js';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

describe('mergeContributions', () => {
    it('unions arrays and ORs booleans', () => {
        const merged = mergeContributions(
            { api: { mounts: ['/ai'], openApi: true }, schemas: { blocks: ['a'] } },
            { api: { mounts: ['/billing'] }, schemas: { blocks: ['b'] }, server: { attach: true } }
        );
        expect(merged.api?.mounts).toEqual(['/ai', '/billing']);
        expect(merged.api?.openApi).toBe(true);
        expect(merged.schemas?.blocks).toEqual(['a', 'b']);
        expect(merged.server?.attach).toBe(true);
    });
});

describe('ContributionCollector + registerHostPlugins', () => {
    it('derives block and event contributions from init', async () => {
        const plugin: HostPluginModule = {
            manifest: {
                id: 'contrib-test',
                label: 'Contrib test',
                source: 'private',
                scope: 'project',
                categories: ['content'],
                contributes: { schemas: { blocks: ['play/declared'] } }
            },
            init(ctx) {
                ctx.registerBlockSchema({
                    type: 'play/derived',
                    label: 'Derived',
                    fields: {}
                });
                ctx.onEvent('entry.afterUpdate', async () => {});
            }
        };

        await registerHostPlugins([plugin]);
        const got = pluginRegistry.getContributions('contrib-test');
        expect(got.schemas?.blocks).toEqual(
            expect.arrayContaining(['play/declared', 'play/derived'])
        );
        expect(got.events?.subscribes).toContain('entry.afterUpdate');
    });

    it('warns when a required plugin is missing', async () => {
        const warns: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => {
            warns.push(args.map(String).join(' '));
        };
        try {
            const plugin: HostPluginModule = {
                manifest: {
                    id: 'needs-ai',
                    label: 'Needs AI',
                    source: 'private',
                    requires: ['ai']
                },
                init() {}
            };
            await registerHostPlugins([plugin]);
        } finally {
            console.warn = original;
        }
        expect(warns.some(w => w.includes('requires ai'))).toBe(true);
    });
});

describe('ContributionCollector', () => {
    it('records storage and plan limits', () => {
        const c = new ContributionCollector();
        c.addStorageAdapter('s3');
        c.setPlanLimit('aiCredits');
        c.markCreditsMutated();
        const snap = c.snapshot();
        expect(snap.adapters?.storage).toEqual(['s3']);
        expect(snap.planLimits?.aiCredits).toBe(true);
        expect(snap.metering?.mutatesCredits).toBe(true);
    });
});
