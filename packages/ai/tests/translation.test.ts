import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    translateBlockArray,
    translateEntry,
    translateField,
    type Block,
    type ModelSchemaLike
} from '../src/translation.js';
import { setAdapter } from '../src/adapter.js';
import { setCredits } from '../src/credits.js';
import type { MoteurAIAdapter, MoteurAIContext } from '../src/types.js';

describe('translation', () => {
    const context: MoteurAIContext = {
        projectId: 'proj-translation',
        projectName: 'Demo',
        projectLocales: ['en', 'fr'],
        defaultLocale: 'en',
        credits: { remaining: 1000 }
    };

    beforeEach(() => {
        setAdapter(null);
        setCredits('proj-translation', 1000);
    });

    afterEach(() => {
        setAdapter(null);
        vi.restoreAllMocks();
    });

    it('translates a plain text field and trims adapter output', async () => {
        const generate = vi.fn(async (prompt: string) => {
            expect(prompt).toContain('from en to fr');
            return ' Bonjour ';
        });
        setAdapter({ generate } as MoteurAIAdapter);

        const result = await translateField('Hello', 'core/text', 'en', 'fr', context);
        expect(result).toBe('Bonjour');
    });

    it('translates rich-text while preserving HTML structure', async () => {
        const generate = vi.fn(async () => 'Bonjour\n---\nMonde');
        setAdapter({ generate } as MoteurAIAdapter);

        const html = '<p>Hello <strong>world</strong></p>';
        const result = await translateField(html, 'core/rich-text', 'en', 'fr', context);

        expect(String(result)).toContain('<p>');
        expect(String(result)).toContain('<strong>');
        expect(String(result)).toContain('Bonjour');
        expect(String(result)).toContain('Monde');
    });

    it('returns partial block result when credits are insufficient mid-stream', async () => {
        const generate = vi.fn(async () => 'Traduit');
        setAdapter({ generate } as MoteurAIAdapter);
        setCredits('proj-translation', 1); // only enough for one block

        const blocks: Block[] = [
            { type: 'hero', data: { title: { en: 'A' } } },
            { type: 'hero', data: { title: { en: 'B' } } }
        ];
        const schema = { title: { type: 'core/text' } };

        const result = await translateBlockArray(blocks, 'en', 'fr', context, () => schema);
        expect(result.partial).toBe(true);
        expect(result.blocks).toHaveLength(1);
        expect(result.blocks[0].data.title).toEqual({ en: 'A', fr: 'Traduit' });
    });

    it('translates only multilingual entry fields and skips already-filled targets', async () => {
        const generate = vi.fn(async (prompt: string) => {
            if (prompt.includes('Hello body')) return 'Corps';
            return 'Traduit';
        });
        setAdapter({ generate } as MoteurAIAdapter);

        const model: ModelSchemaLike = {
            id: 'article',
            fields: {
                title: { type: 'core/text', options: { multilingual: true } },
                body: { type: 'core/textarea', options: { multilingual: true } },
                slug: { type: 'core/text', options: { multilingual: false } }
            }
        };
        const entry = {
            id: 'e1',
            data: {
                title: { en: 'Hello title', fr: 'Titre deja la' }, // should keep existing fr
                body: { en: 'Hello body' }, // should create fr
                slug: 'hello-title'
            }
        };

        const result = await translateEntry(entry, model, 'en', ['fr', 'en'], context);

        expect(result.title).toBeUndefined();
        expect(result.body).toEqual({ en: 'Hello body', fr: 'Corps' });
        expect((result as any).slug).toBeUndefined();
    });
});
