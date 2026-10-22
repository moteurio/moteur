import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** An audio value: `{ src, assetId?, title?, transcript? }`. Empty is fine unless required. */
export function validateAudioField(value: any, _field: Field, path: string): ValidationIssue[] {
    if (value === null || value === undefined) return [];
    if (!isPlainObject(value)) {
        return [
            {
                type: 'error',
                code: 'AUDIO_INVALID_TYPE',
                message: 'Expected an audio object with src (URL).',
                path,
                context: { value }
            }
        ];
    }
    if (!filled(value.src) && !filled(value.assetId)) {
        return [
            {
                type: 'error',
                code: 'AUDIO_MISSING_SRC',
                message: 'Audio needs a "src" URL or an "assetId".',
                path: `${path}.src`,
                context: { src: value.src }
            }
        ];
    }
    return [];
}
