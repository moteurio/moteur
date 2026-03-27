import { describe, it, expect } from 'vitest';
import { registerHostPlugins } from '../../src/plugins/registerCorePlugins.js';
import { pluginRegistry } from '../../src/registry/PluginRegistry.js';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

describe('registerCorePlugins / host plugins', () => {
    it('registerHostPlugins registers host-provided plugin modules', async () => {
        const before = new Set(pluginRegistry.list());
        const plugin: HostPluginModule = {
            manifest: {
                id: 'test-plugin',
                label: 'Test plugin',
                source: 'private',
                scope: 'project'
            },
            init: () => {}
        };
        await expect(registerHostPlugins([plugin])).resolves.not.toThrow();
        const after = new Set(pluginRegistry.list());
        expect(before.size).toBeLessThanOrEqual(after.size);
        expect(after.has('test-plugin')).toBe(true);
    });
});
