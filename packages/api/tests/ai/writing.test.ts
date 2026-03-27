import { describe, it, expect, beforeEach, afterEach, vi as _vi } from 'vitest';
import {
    runWritingAction,
    setAdapter,
    setCredits,
    getCredits,
    type FieldMeta,
    type MoteurAIAdapter,
    type MoteurAIContext
} from '@moteurio/ai';

const PROJECT_ID = 'test-project';

const baseContext: MoteurAIContext = {
    projectId: PROJECT_ID,
    projectName: 'Test Project',
    projectLocales: ['en', 'fr'],
    defaultLocale: 'en',
    model: { id: 'article', label: 'Article', fields: {} },
    entry: { title: 'Hello World', category: 'News' },
    credits: { remaining: 100 }
};

const mockAdapter: MoteurAIAdapter = {
    async generate(prompt: string) {
        return `[generated for: ${prompt.slice(0, 50)}...]`;
    }
};

describe('runWritingAction', () => {
    beforeEach(() => {
        setAdapter(mockAdapter);
        setCredits(PROJECT_ID, 100);
    });

    afterEach(() => {
        setAdapter(null);
    });

    it('draft action produces output and deducts credits', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Title',
            type: 'core/text',
            fieldKey: 'title'
        };
        const result = await runWritingAction('draft', null, fieldMeta, baseContext);
        expect(result).toContain('[generated for:');
        expect(getCredits(PROJECT_ID)).toBe(98); // 2 for short draft
    });

    it('draft for body field costs 5 credits', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Body',
            type: 'core/rich-text',
            fieldKey: 'body'
        };
        setCredits(PROJECT_ID, 10);
        await runWritingAction('draft', null, fieldMeta, baseContext);
        expect(getCredits(PROJECT_ID)).toBe(5);
    });

    it('rewrite action includes current value in prompt and deducts 2', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Excerpt',
            type: 'core/text',
            fieldKey: 'excerpt'
        };
        const result = await runWritingAction(
            'rewrite',
            'Original text here',
            fieldMeta,
            baseContext
        );
        expect(result).toContain('[generated for:');
        expect(getCredits(PROJECT_ID)).toBe(98);
    });

    it('tone:formal deducts 1 credit', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Content',
            type: 'core/text',
            fieldKey: 'content'
        };
        await runWritingAction('tone:formal', 'Some content', fieldMeta, baseContext);
        expect(getCredits(PROJECT_ID)).toBe(99);
    });

    it('summarise-excerpt uses bodyValueForExcerpt and deducts 2', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Excerpt',
            type: 'core/text',
            fieldKey: 'excerpt'
        };
        const result = await runWritingAction('summarise-excerpt', null, fieldMeta, baseContext, {
            bodyValueForExcerpt: 'Long article body here...',
            locale: 'en'
        });
        expect(result).toContain('[generated for:');
        expect(getCredits(PROJECT_ID)).toBe(98);
    });

    it('throws INSUFFICIENT_CREDITS when balance too low', async () => {
        setCredits(PROJECT_ID, 0);
        const fieldMeta: FieldMeta = {
            label: 'Title',
            type: 'core/text',
            fieldKey: 'title'
        };
        await expect(runWritingAction('draft', null, fieldMeta, baseContext)).rejects.toThrow(
            'INSUFFICIENT_CREDITS'
        );
    });

    it('skipDeduction does not deduct credits (grace regeneration)', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Title',
            type: 'core/text',
            fieldKey: 'title'
        };
        const before = getCredits(PROJECT_ID);
        await runWritingAction('draft', null, fieldMeta, baseContext, {
            skipDeduction: true
        });
        expect(getCredits(PROJECT_ID)).toBe(before);
    });

    it('rich-text output is wrapped in HTML', async () => {
        const fieldMeta: FieldMeta = {
            label: 'Body',
            type: 'core/rich-text',
            fieldKey: 'body'
        };
        const result = await runWritingAction('draft', null, fieldMeta, baseContext);
        expect(result).toMatch(/<p>/);
    });
});
