import { describe, it, expect } from 'vitest';
import { validateTableField } from '../../../../src/validators/fields/core/validateTableField.js';
import { Field } from '@moteurio/types/Field.js';

describe('validateTableField', () => {
    const baseField: Field = {
        type: 'core/table',
        label: 'Test Table',
        options: {}
    };

    it('accepts valid table data (no schema, default options)', () => {
        const value = [
            [1, 2],
            [3, 4]
        ];

        const issues = validateTableField(value, baseField, 'data.table');
        expect(issues).toEqual([]);
    });

    it('accepts { rows: [...] } stored shape', () => {
        const value = {
            rows: [
                [1, 2],
                [3, 4]
            ]
        };
        expect(validateTableField(value, baseField, 'data.table')).toEqual([]);
    });

    it('rejects if rows is not an array', () => {
        const issues = validateTableField('not-an-array', baseField, 'data.table');
        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'TABLE_INVALID_FORMAT' })])
        );
    });

    it('checks minRows and maxRows', () => {
        const field: Field = {
            ...baseField,
            options: { minRows: 3, maxRows: 4 }
        };

        const tooFew = [[1]];
        const tooMany = [[1], [2], [3], [4], [5]];

        expect(validateTableField(tooFew, field, 'data.table')).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'TABLE_TOO_FEW_ROWS' })])
        );

        expect(validateTableField(tooMany, field, 'data.table')).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'TABLE_TOO_MANY_ROWS' })])
        );
    });

    it('checks minCols and maxCols', () => {
        const field: Field = {
            ...baseField,
            options: { minCols: 2, maxCols: 3 }
        };

        const tooFewCols = [[1]];
        const tooManyCols = [[1, 2, 3, 4]];

        expect(validateTableField(tooFewCols, field, 'data.table')).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'TABLE_TOO_FEW_COLUMNS' })])
        );

        expect(validateTableField(tooManyCols, field, 'data.table')).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 'TABLE_TOO_MANY_COLUMNS' })])
        );
    });

    it('validates cell schema with core/number', () => {
        const field: Field = {
            ...baseField,
            options: {
                validateCellSchema: { type: 'core/number', label: 'Cell' }
            }
        };

        const valid = [
            [1, 2],
            [3, 4]
        ];
        const invalid = [[1, 'not-a-number']];

        expect(validateTableField(valid, field, 'data.table')).toEqual([]);
        expect(validateTableField(invalid, field, 'data.table')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'NUMBER_INVALID_TYPE',
                    path: 'data.table[0][1]'
                })
            ])
        );
    });

    it('allows empty cells if allowEmptyCells is true', () => {
        const field: Field = {
            ...baseField,
            options: {
                validateCellSchema: { type: 'core/text', label: 'Cell' },
                allowEmptyCells: true
            }
        };

        const value = [
            ['valid', ''],
            ['', null]
        ];

        expect(validateTableField(value, field, 'data.table')).toEqual([]);
    });

    it('rejects empty cells if allowEmptyCells is false', () => {
        const field: Field = {
            ...baseField,
            options: {
                validateCellSchema: { type: 'core/text', label: 'Cell' },
                allowEmptyCells: false
            }
        };

        const value = [
            ['valid', ''],
            ['', null]
        ];

        const issues = validateTableField(value, field, 'data.table');
        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: 'TEXT_INVALID_TYPE'
                })
            ])
        );
    });

    it('accepts table with no validateCellSchema', () => {
        const field: Field = { ...baseField, options: {} };
        const value = [['text', 42, true]];

        const issues = validateTableField(value, field, 'data.table');
        expect(issues).toEqual([]);
    });
});
