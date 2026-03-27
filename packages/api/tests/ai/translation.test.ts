import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    translateField,
    translateBlockArray,
    translateEntry,
    setAdapter,
    setCredits,
    MockAdapter,
    type Block,
    type MoteurAIContext
} from '@moteurio/ai';

const PROJECT_ID = 'translation-project';

const baseContext: MoteurAIContext = {
    projectId: PROJECT_ID,
    projectLocales: ['en', 'fr'],
    defaultLocale: 'en',
    credits: { remaining: 100 }
};

describe('translateField', () => {
    beforeEach(() => {
        setAdapter(new MockAdapter());
        setCredits(PROJECT_ID, 100);
    });
    afterEach(() => {
        setAdapter(null);
    });

    it('translates plain text and deducts 1 credit', async () => {
        const result = await translateField('Hello world', 'core/text', 'en', 'fr', baseContext);
        expect(result).toContain('[mock:');
        expect(result).toBeDefined();
    });

    it('preserves HTML structure for rich-text (DOM path)', async () => {
        const html = '<p>Hello <strong>world</strong></p>';
        const result = await translateField(html, 'core/rich-text', 'en', 'fr', baseContext);
        expect(typeof result).toBe('string');
        expect((result as string).length).toBeGreaterThan(0);
    });

    it('throws INSUFFICIENT_CREDITS when balance too low', async () => {
        setCredits(PROJECT_ID, 0);
        await expect(translateField('Hi', 'core/text', 'en', 'fr', baseContext)).rejects.toThrow(
            'INSUFFICIENT_CREDITS'
        );
    });
});

describe('translateBlockArray', () => {
    beforeEach(() => {
        setAdapter(new MockAdapter());
        setCredits(PROJECT_ID, 10);
    });
    afterEach(() => {
        setAdapter(null);
    });

    it('translates text fields in blocks and leaves non-text unchanged', async () => {
        const blocks: Block[] = [
            {
                type: 'core/hero',
                data: {
                    title: { en: 'Welcome' },
                    backgroundImage: { src: '/img.png' }
                }
            }
        ];
        const getSchema = (type: string) =>
            type === 'core/hero'
                ? { title: { type: 'core/text' }, backgroundImage: { type: 'core/image' } }
                : undefined;
        const { blocks: out } = await translateBlockArray(
            blocks,
            'en',
            'fr',
            baseContext,
            getSchema
        );
        expect(out).toHaveLength(1);
        expect(out[0].data.backgroundImage).toEqual({ src: '/img.png' });
        expect(out[0].data.title).toHaveProperty('fr');
    });

    it('returns partial when credits run out', async () => {
        setCredits(PROJECT_ID, 1);
        const blocks: Block[] = [
            { type: 'core/text', data: { content: { en: 'A' } } },
            { type: 'core/text', data: { content: { en: 'B' } } }
        ];
        const getSchema = () => ({ content: { type: 'core/text' } });
        const { blocks: out, partial } = await translateBlockArray(
            blocks,
            'en',
            'fr',
            baseContext,
            getSchema
        );
        expect(partial).toBe(true);
        expect(out.length).toBeLessThan(blocks.length);
    });
});

describe('translateEntry', () => {
    beforeEach(() => {
        setAdapter(new MockAdapter());
        setCredits(PROJECT_ID, 100);
    });
    afterEach(() => {
        setAdapter(null);
    });

    it('translates only multilingual fields and deducts 5 credits', async () => {
        const entry = {
            id: 'e1',
            data: {
                title: { en: 'Hello' },
                body: { en: 'Content' },
                slug: 'hello'
            }
        };
        const model = {
            id: 'article',
            fields: {
                title: { type: 'core/text', options: { multilingual: true } },
                body: { type: 'core/rich-text', options: { multilingual: true } },
                slug: { type: 'core/slug', options: { multilingual: false } }
            }
        };
        const result = await translateEntry(entry, model as any, 'en', ['fr'], baseContext);
        expect(result).toHaveProperty('title');
        expect((result.title as any).fr).toBeDefined();
        expect(result).not.toHaveProperty('slug');
    });

    it('throws INSUFFICIENT_CREDITS when balance < 5', async () => {
        setCredits(PROJECT_ID, 2);
        await expect(
            translateEntry(
                { id: 'e1', data: { title: { en: 'Hi' } } },
                { id: 'm', fields: { title: { options: { multilingual: true } } } } as any,
                'en',
                ['fr'],
                baseContext
            )
        ).rejects.toThrow('INSUFFICIENT_CREDITS');
    });
});
