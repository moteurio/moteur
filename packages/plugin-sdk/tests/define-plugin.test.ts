import { describe, it, expect } from 'vitest';
import { definePlugin } from '../src/index';

describe('definePlugin', () => {
    it('returns the same module reference', () => {
        const plugin = {
            manifest: {
                id: 'test',
                label: 'Test',
                source: 'npm' as const,
                version: '1.0.0'
            },
            init() {}
        };
        expect(definePlugin(plugin)).toBe(plugin);
    });
});
