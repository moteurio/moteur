/**
 * Image analysis service — alt text and caption from image URL via AI.
 * Uses adapter.analyseImage() with two prompts in parallel.
 */

import type { MoteurAIAdapter } from './types.js';

export interface ImageAnalysisContext {
    locale: string;
    modelLabel?: string;
    entryTitle?: string;
    categoryName?: string;
}

export interface ImageAnalysisResult {
    alt: string;
    caption: string;
}

const ALT_PROMPT = `Describe this image in one concise sentence suitable for use as HTML alt text.
Focus on what the image depicts, not its style or composition.
Be specific and factual. Maximum 125 characters.
Do not start with "Image of" or "Photo of".
Locale: {locale}`;

function buildCaptionPrompt(ctx: ImageAnalysisContext): string {
    const parts: string[] = ['Write an editorial image caption for this image.'];
    if (ctx.modelLabel && ctx.entryTitle) {
        parts.push(
            `Context: this image appears in a ${ctx.modelLabel} entry titled "${ctx.entryTitle}".`
        );
    }
    if (ctx.categoryName) {
        parts.push(`Category: ${ctx.categoryName}`);
    }
    parts.push(`Be descriptive and specific. One to two sentences. Locale: ${ctx.locale}.`);
    return parts.join('\n');
}

/**
 * Run alt and caption analysis in parallel. Returns combined result or throws.
 */
export async function analyseImage(
    adapter: MoteurAIAdapter,
    imageUrl: string,
    context: ImageAnalysisContext
): Promise<ImageAnalysisResult> {
    if (!adapter.analyseImage) {
        throw new Error('Adapter does not support image analysis');
    }

    const altPrompt = ALT_PROMPT.replace('{locale}', context.locale);
    const captionPrompt = buildCaptionPrompt(context);

    const [alt, caption] = await Promise.all([
        adapter.analyseImage(imageUrl, altPrompt, { maxTokens: 256, temperature: 0.2 }),
        adapter.analyseImage(imageUrl, captionPrompt, { maxTokens: 512, temperature: 0.3 })
    ]);

    return {
        alt: (alt ?? '').trim().slice(0, 125),
        caption: (caption ?? '').trim()
    };
}
