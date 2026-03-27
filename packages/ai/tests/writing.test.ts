import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWritingAction, type FieldMeta } from '../src/writing.js';
import { setAdapter } from '../src/adapter.js';
import { setCredits } from '../src/credits.js';
import type { MoteurAIContext, MoteurAIAdapter } from '../src/types.js';

describe('writing', () => {
    const context: MoteurAIContext = {
        projectId: 'proj-writing',
        projectName: 'Demo Project',
        projectLocales: ['en', 'fr'],
        defaultLocale: 'en',
        model: { id: 'article', label: 'Article', fields: {} },
        entry: { title: 'Hello World', category: 'News' },
        credits: { remaining: 1000 }
    };

    beforeEach(() => {
        setCredits('proj-writing', 1000);
        setAdapter(null);
    });

    afterEach(() => {
        setAdapter(null);
        vi.restoreAllMocks();
    });

    it('runs draft action and uses long-draft prompt keys for body-like fields', async () => {
        const generate = vi.fn(async (prompt: string) => {
            expect(prompt).toContain('Write a Body');
            expect(prompt).toContain('Target length: long');
            expect(prompt).toContain('Locale: en');
            return 'Draft output';
        });
        setAdapter({ generate } as MoteurAIAdapter);

        const fieldMeta: FieldMeta = { label: 'Body', type: 'core/textarea', fieldKey: 'body' };
        const result = await runWritingAction('draft', null, fieldMeta, context);

        expect(result).toBe('Draft output');
        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('converts rich-text writing output into paragraph HTML', async () => {
        const generate = vi.fn(async () => 'Line one\n\nLine two');
        setAdapter({ generate } as MoteurAIAdapter);

        const fieldMeta: FieldMeta = {
            label: 'Description',
            type: 'core/rich-text',
            fieldKey: 'description'
        };
        const result = await runWritingAction('expand', 'Seed', fieldMeta, context);

        expect(result).toBe('<p>Line one</p><p>Line two</p>');
    });

    it('throws when action requires current value but none is provided', async () => {
        setAdapter({ generate: async () => 'x' } as MoteurAIAdapter);
        const fieldMeta: FieldMeta = { label: 'Title', type: 'core/text', fieldKey: 'title' };

        await expect(runWritingAction('rewrite', '', fieldMeta, context)).rejects.toThrow(
            'Rewrite requires current value'
        );
        await expect(runWritingAction('tone:formal', null, fieldMeta, context)).rejects.toThrow(
            'Tone adjustment requires current value'
        );
    });

    it('throws INSUFFICIENT_CREDITS when balance is below action cost', async () => {
        setCredits('proj-writing', 0);
        setAdapter({ generate: async () => 'ignored' } as MoteurAIAdapter);
        const fieldMeta: FieldMeta = { label: 'Title', type: 'core/text', fieldKey: 'title' };

        await expect(runWritingAction('draft', null, fieldMeta, context)).rejects.toThrow(
            'INSUFFICIENT_CREDITS'
        );
    });

    it('supports summarise-excerpt and truncates huge bodies in prompt', async () => {
        const hugeBody = 'a'.repeat(6500);
        const generate = vi.fn(async (prompt: string) => {
            expect(prompt).toContain('[...truncated]');
            expect(prompt).toContain('Write in fr');
            return 'Short summary';
        });
        setAdapter({ generate } as MoteurAIAdapter);
        const fieldMeta: FieldMeta = { label: 'Excerpt', type: 'core/text', fieldKey: 'excerpt' };

        const result = await runWritingAction('summarise-excerpt', null, fieldMeta, context, {
            bodyValueForExcerpt: hugeBody,
            locale: 'fr'
        });

        expect(result).toBe('Short summary');
    });
});
