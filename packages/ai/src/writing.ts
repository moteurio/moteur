/**
 * AI Writing service — draft, rewrite, shorten, expand, tone, summarise-excerpt.
 * Uses MoteurAIAdapter and deducts credits before calling the provider.
 */

import type { MoteurAIContext } from './types.js';
import { getCreditCost } from './creditCosts.js';
import { getAdapter } from './adapter.js';
import { getCredits, deductCredits } from './credits.js';

export type WritingAction =
    | 'draft'
    | 'rewrite'
    | 'shorten'
    | 'expand'
    | 'tone:formal'
    | 'tone:conversational'
    | 'tone:editorial'
    | 'summarise-excerpt';

export interface FieldMeta {
    label: string;
    type: 'core/text' | 'core/rich-text' | 'core/textarea';
    fieldKey: string;
}

/** Resolve credit cost from configurable costs (write.* keys). */
function getCostForAction(action: WritingAction, fieldMeta: FieldMeta): number {
    if (action === 'draft') {
        const isLong =
            fieldMeta.type === 'core/rich-text' ||
            ['body', 'description', 'content'].includes(fieldMeta.fieldKey);
        return getCreditCost(isLong ? 'write.draft_long' : 'write.draft');
    }
    if (
        action === 'tone:formal' ||
        action === 'tone:conversational' ||
        action === 'tone:editorial'
    ) {
        return getCreditCost('write.tone');
    }
    if (action === 'summarise-excerpt') return getCreditCost('write.summarise_excerpt');
    return getCreditCost(`write.${action}` as 'write.rewrite' | 'write.shorten' | 'write.expand');
}

function inferTargetLength(fieldKey: string, _fieldType: string): 'short' | 'medium' | 'long' {
    if (['title', 'name', 'slug'].includes(fieldKey)) return 'short';
    if (['body', 'description', 'content'].includes(fieldKey)) return 'long';
    return 'medium';
}

function buildDraftPrompt(fieldMeta: FieldMeta, context: MoteurAIContext, locale: string): string {
    const modelLabel = context.model?.label ?? 'entry';
    const title =
        context.entry && typeof context.entry.title === 'string'
            ? context.entry.title
            : context.entry && (context.entry as any).title;
    const titleStr = title != null ? String(title) : '';
    const category = context.entry && (context.entry as any).category;
    const issue = context.entry && (context.entry as any).issue;
    const targetLength = inferTargetLength(fieldMeta.fieldKey, fieldMeta.type);
    const typeLabel =
        fieldMeta.type === 'core/rich-text'
            ? 'rich text'
            : fieldMeta.type === 'core/textarea'
              ? 'plain text'
              : 'plain text';
    const parts = [
        `You are a professional content editor for ${context.projectName ?? 'this project'}.`,
        `Write a ${fieldMeta.label} for the following ${modelLabel} entry.`,
        '',
        'Entry context:',
        titleStr ? `- Title: ${titleStr}` : '',
        category
            ? `- Category: ${typeof category === 'string' ? category : ((category as any)?.name ?? category)}`
            : '',
        issue
            ? `- Issue: ${typeof issue === 'string' ? issue : ((issue as any)?.name ?? issue)}`
            : '',
        '',
        `Field being written: ${fieldMeta.label}`,
        `Field type: ${typeLabel}`,
        `Target length: ${targetLength}`,
        `Locale: ${locale}`,
        '',
        `Write in ${locale} only. Do not include a title or heading unless the field itself is a heading. Do not explain what you are writing — return only the content.`
    ];
    return parts.filter(Boolean).join('\n');
}

function buildRewritePrompt(fieldMeta: FieldMeta, currentValue: string): string {
    return [
        `You are a professional editor. Rewrite the following ${fieldMeta.label}.`,
        'Maintain the meaning and tone. Improve clarity and flow.',
        'Return only the revised content — no explanation.',
        '',
        'Original:',
        currentValue
    ].join('\n');
}

function buildShortenPrompt(fieldMeta: FieldMeta, currentValue: string): string {
    return [
        `You are a professional editor. Shorten the following ${fieldMeta.label} by approximately 40%.`,
        'Keep the most important points. Preserve the tone.',
        'Return only the shortened content — no explanation.',
        '',
        'Original:',
        currentValue
    ].join('\n');
}

function buildExpandPrompt(fieldMeta: FieldMeta, currentValue: string): string {
    return [
        `You are a professional editor. Expand the following ${fieldMeta.label}.`,
        'Add depth, specificity, and supporting detail. Maintain the existing tone.',
        'Return only the expanded content — no explanation.',
        '',
        'Original:',
        currentValue
    ].join('\n');
}

function buildTonePrompt(
    fieldMeta: FieldMeta,
    currentValue: string,
    tone: 'formal' | 'conversational' | 'editorial'
): string {
    return [
        `You are a professional editor. Rewrite the following ${fieldMeta.label} in a ${tone} tone.`,
        'Preserve the meaning. Do not add or remove significant content.',
        'Return only the rewritten content — no explanation.',
        '',
        'Original:',
        currentValue
    ].join('\n');
}

/** Truncate to ~1500 tokens (roughly 4 chars per token) */
function truncateForTokens(text: string, maxChars: number = 6000): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[...truncated]';
}

function buildSummariseExcerptPrompt(bodyValue: string, locale: string): string {
    const body = truncateForTokens(bodyValue);
    return [
        'Write a 1-2 sentence excerpt for the following article body.',
        'The excerpt should be compelling and capture the key idea.',
        `Write in ${locale}. Return only the excerpt — no explanation.`,
        '',
        'Body:',
        body
    ].join('\n');
}

export async function runWritingAction(
    action: WritingAction,
    currentValue: string | null,
    fieldMeta: FieldMeta,
    context: MoteurAIContext,
    options?: { bodyValueForExcerpt?: string; locale?: string; skipDeduction?: boolean }
): Promise<string> {
    const locale = options?.locale ?? context.defaultLocale;
    const cost = getCostForAction(action, fieldMeta);
    const projectId = context.projectId;
    const balance = getCredits(projectId);
    if (balance < cost && !options?.skipDeduction) {
        throw new Error('INSUFFICIENT_CREDITS');
    }

    const adapter = await getAdapter();
    if (!adapter) {
        throw new Error('AI provider not configured');
    }

    if (!options?.skipDeduction) {
        const { success } = deductCredits(projectId, cost);
        if (!success) {
            throw new Error('INSUFFICIENT_CREDITS');
        }
    }

    let prompt: string;
    if (action === 'draft') {
        prompt = buildDraftPrompt(fieldMeta, context, locale);
    } else if (action === 'rewrite') {
        if (currentValue == null || currentValue === '')
            throw new Error('Rewrite requires current value');
        prompt = buildRewritePrompt(fieldMeta, currentValue);
    } else if (action === 'shorten') {
        if (currentValue == null || currentValue === '')
            throw new Error('Shorten requires current value');
        prompt = buildShortenPrompt(fieldMeta, currentValue);
    } else if (action === 'expand') {
        if (currentValue == null || currentValue === '')
            throw new Error('Expand requires current value');
        prompt = buildExpandPrompt(fieldMeta, currentValue);
    } else if (
        action === 'tone:formal' ||
        action === 'tone:conversational' ||
        action === 'tone:editorial'
    ) {
        if (currentValue == null || currentValue === '')
            throw new Error('Tone adjustment requires current value');
        const tone = action.replace('tone:', '') as 'formal' | 'conversational' | 'editorial';
        prompt = buildTonePrompt(fieldMeta, currentValue, tone);
    } else if (action === 'summarise-excerpt') {
        const body = options?.bodyValueForExcerpt;
        if (!body || body.trim() === '')
            throw new Error('Summarise as excerpt requires body content');
        prompt = buildSummariseExcerptPrompt(body, locale);
    } else {
        throw new Error(`Unknown writing action: ${action}`);
    }

    let result = await adapter.generate(prompt, { maxTokens: 2048, temperature: 0.5 });
    result = result.trim();

    if (fieldMeta.type === 'core/rich-text') {
        result = plainTextToHtml(result);
    }
    return result;
}

function plainTextToHtml(text: string): string {
    if (!text) return '';
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const paragraphs = escaped.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length === 0) return '';
    if (paragraphs.length === 1) return `<p>${paragraphs[0]}</p>`;
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
}
