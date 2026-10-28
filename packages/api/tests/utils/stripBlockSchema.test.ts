import { describe, expect, it } from 'vitest';
import type { BlockSchema } from '@moteurio/types/Block.js';
import { stripEditorialBlocksFromPayload } from '../../src/utils/stripBlockSchema.js';

const blocks = {
    'core/note': { type: 'core/note', label: 'Note', editorial: true, fields: {} },
    'core/text': { type: 'core/text', label: 'Text', fields: {} },
    'core/columns': { type: 'core/columns', label: 'Columns', fields: {} }
} as unknown as Record<string, BlockSchema>;

describe('stripEditorialBlocksFromPayload', () => {
    it('leaves notes out, in blocks held by other blocks too', () => {
        const payload = {
            body: [
                { type: 'core/note', data: { text: 'Ask legal' } },
                {
                    type: 'core/columns',
                    data: {
                        left: [
                            { type: 'core/text', data: { text: 'Hello' } },
                            { type: 'core/note', data: { text: 'Draft wording' } }
                        ]
                    }
                }
            ]
        };
        expect(stripEditorialBlocksFromPayload(payload, blocks)).toEqual({
            body: [
                {
                    type: 'core/columns',
                    data: { left: [{ type: 'core/text', data: { text: 'Hello' } }] }
                }
            ]
        });
    });
});
