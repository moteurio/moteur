import { describe, it, expect } from 'vitest';
import {
    getCoreIdFieldIds,
    stripCoreIdFromData,
    ensureCoreIdValues
} from '../../src/utils/coreIdFields.js';
import type { ModelSchema } from '@moteurio/types/Model.js';

describe('coreIdFields', () => {
    describe('getCoreIdFieldIds', () => {
        it('returns empty array when schema is undefined', () => {
            expect(getCoreIdFieldIds(undefined as any)).toEqual([]);
        });

        it('returns empty array when schema has no fields', () => {
            expect(
                getCoreIdFieldIds({ id: 'm1', label: 'Model', fields: {} } as ModelSchema)
            ).toEqual([]);
        });

        it('returns empty array when no fields are core/id', () => {
            const schema: ModelSchema = {
                id: 'm1',
                label: 'Model',
                fields: {
                    title: { type: 'core/text', label: 'Title' },
                    count: { type: 'core/number', label: 'Count' }
                }
            } as ModelSchema;
            expect(getCoreIdFieldIds(schema)).toEqual([]);
        });

        it('returns field IDs that have type core/id', () => {
            const schema: ModelSchema = {
                id: 'm1',
                label: 'Model',
                fields: {
                    title: { type: 'core/text', label: 'Title' },
                    uuid: { type: 'core/id', label: 'UUID' },
                    refId: { type: 'core/id', label: 'Ref ID' }
                }
            } as ModelSchema;
            expect(getCoreIdFieldIds(schema)).toEqual(['uuid', 'refId']);
        });
    });

    describe('stripCoreIdFromData', () => {
        it('returns data unchanged when coreIdFields is empty', () => {
            const data = { uuid: 'x', title: 'Hi' };
            expect(stripCoreIdFromData(data, [])).toEqual(data);
        });

        it('returns empty object when data is undefined', () => {
            expect(stripCoreIdFromData(undefined, ['uuid'])).toEqual({});
        });

        it('strips core/id fields from data', () => {
            const data = { uuid: 'client-provided', title: 'Hi', refId: 'also-client' };
            const result = stripCoreIdFromData(data, ['uuid', 'refId']);
            expect(result).toEqual({ title: 'Hi' });
            expect(result).not.toHaveProperty('uuid');
            expect(result).not.toHaveProperty('refId');
        });

        it('does not mutate original data', () => {
            const data = { uuid: 'x', title: 'Hi' };
            stripCoreIdFromData(data, ['uuid']);
            expect(data.uuid).toBe('x');
        });
    });

    describe('ensureCoreIdValues', () => {
        it('generates UUIDs for core/id fields', () => {
            const data = { title: 'Hi' };
            const result = ensureCoreIdValues(data, ['uuid', 'refId']);
            expect(result.title).toBe('Hi');
            expect(result.uuid).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
            expect(result.refId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        });

        it('overwrites client-provided values for core/id fields', () => {
            const data = { uuid: 'client-uuid', title: 'Hi' };
            const result = ensureCoreIdValues(data, ['uuid']);
            expect(result.uuid).not.toBe('client-uuid');
            expect(result.uuid).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            );
        });

        it('returns new object when data is undefined', () => {
            const result = ensureCoreIdValues(undefined, ['uuid']);
            expect(result).toHaveProperty('uuid');
            expect(Object.keys(result)).toEqual(['uuid']);
        });

        it('does not mutate original data', () => {
            const data = { uuid: 'old' };
            const result = ensureCoreIdValues(data, ['uuid']);
            expect(data.uuid).toBe('old');
            expect(result.uuid).not.toBe('old');
        });
    });
});
