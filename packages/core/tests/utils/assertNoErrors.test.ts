import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { assertNoErrors } from '../../src/utils/validation.js';

const note: ValidationIssue = {
    type: 'warning',
    code: 'BLOCK_FIELD_MISSING',
    message: 'Optional field "lead" has no value.',
    path: 'body[0].data.lead'
};
const error: ValidationIssue = {
    type: 'error',
    code: 'LIST_NOT_EMPTY',
    message: 'List cannot be empty.',
    path: 'comments'
};

describe('refusing what has errors', () => {
    it('says the errors, never the notes, and carries every issue', () => {
        let thrown: (Error & { status?: number; issues?: ValidationIssue[] }) | undefined;
        try {
            assertNoErrors('Page', [note, error], 422);
        } catch (err) {
            thrown = err as typeof thrown;
        }
        expect(thrown?.message).toBe('Page validation failed: comments: List cannot be empty.');
        expect(thrown?.status).toBe(422);
        expect(thrown?.issues).toEqual([note, error]);
    });

    it('lets notes alone through', () => {
        expect(() => assertNoErrors('Model', [note])).not.toThrow();
    });
});
