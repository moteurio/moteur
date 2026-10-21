import { describe, expect, it } from 'vitest';
import { listBlocks } from '../src/blocks.js';
import { getStructureFromCore } from '../src/structures.js';

describe('shipped blocks and structures', () => {
    it('are available with no data/core files', () => {
        expect(listBlocks()['core/paragraph']?.fields.content.type).toBe('core/rich-text');
        expect(listBlocks()['core/hero']?.label).toBe('Hero');
        const seo = getStructureFromCore('core/seo');
        expect(seo.fields.seoTitle.type).toBe('core/text');
        expect(seo.fields.seoDescription.type).toBe('core/text');
        expect(seo.fields.canonicalUrl.type).toBe('core/url');
        expect(getStructureFromCore('core/audit').fields.publishedCommit.type).toBe('core/text');
        expect(getStructureFromCore('core/publishable').fields.status.type).toBe('core/select');
        expect(getStructureFromCore('core/source').fields.source.required).toBe(true);
    });
});
