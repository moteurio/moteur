/**
 * Validates block.locales in a payload against project's configured locales.
 * Used when saving entries or layouts that contain blocks.
 */

import type { Block } from '@moteurio/types/Block.js';

function isBlockLike(obj: unknown): obj is Block {
    return obj != null && typeof obj === 'object' && 'type' in obj && 'data' in obj;
}

function validateBlockLocales(block: Block, projectLocales: string[], path: string): string[] {
    const errors: string[] = [];
    if (block.locales == null || !Array.isArray(block.locales)) return errors;
    if (projectLocales.length === 0) return errors;

    const invalid = block.locales.filter(lc => !projectLocales.includes(lc));
    if (invalid.length > 0) {
        errors.push(
            `At ${path}: Invalid locale code(s): ${invalid.join(', ')}. Must be one of: ${projectLocales.join(', ')}.`
        );
    }
    return errors;
}

/**
 * Recursively finds block arrays in a payload and validates block.locales.
 * Returns an array of error messages. Empty if valid.
 */
export function validateBlockLocalesInPayload(
    payload: unknown,
    projectLocales: string[],
    path = ''
): string[] {
    const errors: string[] = [];
    if (payload == null) return errors;
    if (projectLocales.length === 0) return errors;

    if (Array.isArray(payload)) {
        const arr = payload as unknown[];
        const isBlockArray = arr.every(isBlockLike);
        if (isBlockArray && arr.length > 0) {
            (arr as Block[]).forEach((block, i) => {
                errors.push(...validateBlockLocales(block, projectLocales, `${path}[${i}]`));
                // Recurse into block.data for nested structures (e.g. container blocks)
                if (block.data && typeof block.data === 'object') {
                    for (const [k, v] of Object.entries(block.data)) {
                        errors.push(
                            ...validateBlockLocalesInPayload(
                                v,
                                projectLocales,
                                `${path}[${i}].data.${k}`
                            )
                        );
                    }
                }
            });
        } else {
            arr.forEach((item, i) => {
                errors.push(
                    ...validateBlockLocalesInPayload(item, projectLocales, `${path}[${i}]`)
                );
            });
        }
        return errors;
    }

    if (typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload)) {
            const nextPath = path ? `${path}.${k}` : k;
            errors.push(...validateBlockLocalesInPayload(v, projectLocales, nextPath));
        }
    }
    return errors;
}
