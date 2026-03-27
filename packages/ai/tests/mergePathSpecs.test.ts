import { describe, it, expect } from 'vitest';
import { mergePathSpecs } from '../src/routes/mergePathSpecs.js';

describe('mergePathSpecs', () => {
    it('merges methods by path and preserves allowed HTTP methods only', () => {
        const merged = mergePathSpecs(
            {
                '/ai/status': {
                    get: { summary: 'status' } as any,
                    post: { summary: 'post-status' } as any
                }
            },
            {
                '/ai/status': {
                    patch: { summary: 'patch-status' } as any,
                    trace: { summary: 'trace-status' } as any,
                    parameters: [{ name: 'ignored', in: 'query' }] as any
                },
                '/ai/write': {
                    post: { summary: 'write' } as any
                }
            }
        );

        expect(Object.keys(merged)).toEqual(['/ai/status', '/ai/write']);
        expect(merged['/ai/status'].get).toBeDefined();
        expect(merged['/ai/status'].post).toBeDefined();
        expect(merged['/ai/status'].patch).toBeDefined();
        expect(merged['/ai/status'].trace).toBeDefined();
        expect((merged['/ai/status'] as any).parameters).toBeUndefined();
        expect(merged['/ai/write'].post).toBeDefined();
    });
});
