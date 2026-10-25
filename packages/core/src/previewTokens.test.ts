import { describe, it, expect } from 'vitest';
import { verifyPreviewToken } from './previewTokens.js';

describe('previewTokens', () => {
    it('rejects unknown tokens', async () => {
        const r = await verifyPreviewToken('any-project', 'mpv_invalid');
        expect(r.ok).toBe(false);
    });
});
