/**
 * AI Translation — translateField, translateBlockArray, translateEntry.
 * Uses MoteurAIAdapter, deducts credits before each operation.
 */

import { parseHTML } from 'linkedom';
import type { MoteurAIContext } from './types.js';
import { getCreditCost } from './creditCosts.js';
import { getAdapter } from './adapter.js';
import { getCredits, deductCredits } from './credits.js';

export type TranslatableFieldType = 'core/text' | 'core/rich-text' | 'core/textarea';

/** Rich-text value is HTML string. */
export type RichTextValue = string;

export interface Block {
    type: string;
    data: Record<string, unknown>;
    variant?: string;
    locales?: string[];
    [key: string]: unknown;
}

export type EntryData = Record<string, unknown>;

export interface ModelSchemaLike {
    id: string;
    label?: string;
    fields?: Record<
        string,
        { type?: string; label?: string; options?: { multilingual?: boolean } }
    >;
}

function buildTranslatePrompt(
    fieldType: string,
    fromLocale: string,
    toLocale: string,
    value: string
): string {
    return `You are a professional translator working for a content team.
Translate the following ${fieldType} from ${fromLocale} to ${toLocale}.

Rules:
- Preserve all HTML tags and attributes exactly - do not modify, add, or remove any tags
- Preserve proper nouns, brand names, and product designations unchanged
- Match the tone and register of the source text
- Return only the translated content - no explanation, no commentary, no wrapper

Source (${fromLocale}):
${value}`;
}

/**
 * Extract text from HTML, translate, then re-inject into the original DOM.
 * Uses linkedom for parse/serialize. No regex for HTML.
 */
async function translateHtmlWithDom(
    html: string,
    fromLocale: string,
    toLocale: string,
    context: MoteurAIContext,
    adapter: { generate: (p: string, o?: any) => Promise<string> }
): Promise<string> {
    if (!html || !html.trim()) return html;
    const wrapped = html.trimStart().startsWith('<') ? html : `<p>${html}</p>`;
    const { document } = parseHTML(`<!DOCTYPE html><html><body>${wrapped}</body></html>`);
    const body = document.body;
    if (!body) return html;
    const textNodes: { node: { textContent: string | null }; text: string }[] = [];
    const walk = (node: any) => {
        if (node.nodeType === 3) {
            const text = node.textContent?.trim();
            if (text) textNodes.push({ node, text });
        }
        node.childNodes.forEach(walk);
    };
    walk(body);
    if (textNodes.length === 0) return html;
    const texts = textNodes.map(t => t.text);
    const prompt = buildTranslatePrompt('rich-text', fromLocale, toLocale, texts.join('\n---\n'));
    const result = await adapter.generate(prompt, { maxTokens: 4096, temperature: 0.2 });
    const translated = result.trim();
    const parts = translated.includes('---') ? translated.split(/\n---\n/) : [translated];
    textNodes.forEach(({ node }, i) => {
        node.textContent = parts[i] ?? parts[0] ?? '';
    });
    return body.innerHTML;
}

export async function translateField(
    value: string | RichTextValue,
    fieldType: TranslatableFieldType,
    fromLocale: string,
    toLocale: string,
    context: MoteurAIContext,
    options?: { skipDeduction?: boolean }
): Promise<string | RichTextValue> {
    const projectId = context.projectId;
    const cost =
        fieldType === 'core/rich-text'
            ? getCreditCost('translate.rich_text')
            : getCreditCost('translate.field');
    const adapter = await getAdapter();
    if (!adapter?.generate) {
        throw new Error('AI provider not configured');
    }
    if (!options?.skipDeduction) {
        if (getCredits(projectId) < cost) {
            throw new Error('INSUFFICIENT_CREDITS');
        }
        const { success } = deductCredits(projectId, cost);
        if (!success) throw new Error('INSUFFICIENT_CREDITS');
    }

    const str = typeof value === 'string' ? value : String(value ?? '');
    if (!str.trim()) return str;

    if (fieldType === 'core/rich-text') {
        return translateHtmlWithDom(str, fromLocale, toLocale, context, adapter);
    }
    const prompt = buildTranslatePrompt(fieldType, fromLocale, toLocale, str);
    const result = await adapter.generate(prompt, { maxTokens: 2048, temperature: 0.2 });
    return result.trim();
}

/**
 * Identify text fields in a block schema (core/text, core/rich-text).
 * blockSchema is the schema for this block type (fields map).
 */
function getTextFieldKeys(blockSchema: Record<string, { type?: string }> | undefined): string[] {
    if (!blockSchema) return [];
    return Object.entries(blockSchema)
        .filter(
            ([_, def]) =>
                def?.type === 'core/text' ||
                def?.type === 'core/rich-text' ||
                def?.type === 'core/textarea'
        )
        .map(([k]) => k);
}

/**
 * Translate one block's text fields. block.data may have locale maps or plain values.
 */
async function translateOneBlock(
    block: Block,
    blockSchema: Record<string, { type?: string }> | undefined,
    fromLocale: string,
    toLocale: string,
    context: MoteurAIContext,
    adapter: { generate: (p: string, o?: any) => Promise<string> }
): Promise<Block> {
    const textKeys = getTextFieldKeys(blockSchema);
    const data = { ...block.data };
    for (const key of textKeys) {
        const raw = data[key];
        if (raw == null) continue;
        const source =
            typeof raw === 'object' &&
            raw !== null &&
            !Array.isArray(raw) &&
            (raw as any)[fromLocale] != null
                ? String((raw as any)[fromLocale])
                : typeof raw === 'string'
                  ? raw
                  : null;
        if (source == null || !String(source).trim()) continue;
        const prompt = buildTranslatePrompt('text', fromLocale, toLocale, source);
        const translated = await adapter.generate(prompt, { maxTokens: 2048, temperature: 0.2 });
        const trimmed = translated.trim();
        const existing =
            typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])
                ? (data[key] as Record<string, string>)
                : {};
        (data as any)[key] = { ...existing, [toLocale]: trimmed };
    }
    return { ...block, data };
}

export async function translateBlockArray(
    blocks: Block[],
    fromLocale: string,
    toLocale: string,
    context: MoteurAIContext,
    getBlockSchema?: (blockType: string) => Record<string, { type?: string }> | undefined
): Promise<{ blocks: Block[]; partial?: boolean }> {
    const projectId = context.projectId;
    const adapter = await getAdapter();
    if (!adapter?.generate) {
        throw new Error('AI provider not configured');
    }
    const results: Block[] = [];
    for (const block of blocks) {
        const balance = getCredits(projectId);
        const blockCost = getCreditCost('translate.block');
        if (balance < blockCost) {
            return { blocks: results, partial: true };
        }
        const { success } = deductCredits(projectId, blockCost);
        if (!success) {
            return { blocks: results, partial: true };
        }
        const schema = getBlockSchema?.(block.type);
        const translated = await translateOneBlock(
            block,
            schema,
            fromLocale,
            toLocale,
            context,
            adapter
        );
        results.push(translated);
    }
    return { blocks: results };
}

/** Check if target slot is empty or stale (source updated more recently). */
function isTargetEmptyOrStale(
    fieldValue: unknown,
    toLocale: string,
    _sourceUpdatedAt?: string,
    _targetUpdatedAt?: string
): boolean {
    if (fieldValue == null) return true;
    if (typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
        const v = (fieldValue as Record<string, unknown>)[toLocale];
        if (v == null || (typeof v === 'string' && !v.trim())) return true;
        if (_sourceUpdatedAt && _targetUpdatedAt && _sourceUpdatedAt > _targetUpdatedAt)
            return true;
        return false;
    }
    return false;
}

export async function translateEntry(
    entry: { id: string; data?: EntryData },
    model: ModelSchemaLike,
    fromLocale: string,
    toLocales: string[],
    context: MoteurAIContext
): Promise<Partial<EntryData>> {
    const projectId = context.projectId;
    const entryCost = getCreditCost('translate.entry');
    if (getCredits(projectId) < entryCost) {
        throw new Error('INSUFFICIENT_CREDITS');
    }
    const adapter = await getAdapter();
    if (!adapter?.generate) {
        throw new Error('AI provider not configured');
    }
    const { success } = deductCredits(projectId, entryCost);
    if (!success) throw new Error('INSUFFICIENT_CREDITS');

    const fields = model.fields ?? {};
    const result: Partial<EntryData> = {};
    const data = entry.data ?? {};

    for (const [fieldPath, fieldDef] of Object.entries(fields)) {
        const multilingual = fieldDef?.options?.multilingual ?? false;
        if (!multilingual) continue;

        const rawValue = data[fieldPath];
        const fieldType = (fieldDef?.type ?? 'core/text') as TranslatableFieldType;

        for (const toLocale of toLocales) {
            if (fromLocale === toLocale) continue;
            const isEmptyOrStale = isTargetEmptyOrStale(rawValue, toLocale);
            if (!isEmptyOrStale) continue;

            const sourceValue =
                typeof rawValue === 'object' &&
                rawValue !== null &&
                (rawValue as any)[fromLocale] != null
                    ? String((rawValue as any)[fromLocale])
                    : typeof rawValue === 'string'
                      ? rawValue
                      : '';
            if (!String(sourceValue).trim()) continue;

            const translated = await translateField(
                sourceValue,
                fieldType,
                fromLocale,
                toLocale,
                context,
                { skipDeduction: true }
            );
            if (!result[fieldPath]) {
                result[fieldPath] =
                    typeof rawValue === 'object' && rawValue !== null
                        ? { ...(rawValue as object) }
                        : {};
            }
            (result[fieldPath] as Record<string, string>)[toLocale] = translated as string;
        }
    }
    return result;
}
