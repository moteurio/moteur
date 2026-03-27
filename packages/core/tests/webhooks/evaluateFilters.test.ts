import { describe, it, expect } from 'vitest';
import { evaluateFilters } from '../../src/webhooks/webhookService.js';
import type { WebhookFilter } from '@moteurio/types/Webhook.js';

const baseContext = { source: 'studio' as const };

describe('evaluateFilters', () => {
    describe('empty filters', () => {
        it('returns true when filters is empty', () => {
            const data = {
                entryId: 'e1',
                modelId: 'article',
                status: 'published',
                updatedBy: 'u1'
            };
            expect(evaluateFilters([], 'entry.published', data, baseContext)).toBe(true);
        });
    });

    describe('eq / ne', () => {
        it('eq passes when value matches', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'eq', value: 'article' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('eq fails when value does not match', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'eq', value: 'blog' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });

        it('ne passes when value differs', () => {
            expect(
                evaluateFilters(
                    [{ field: 'status', operator: 'ne', value: 'draft' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('ne fails when value equals', () => {
            expect(
                evaluateFilters(
                    [{ field: 'status', operator: 'ne', value: 'published' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });
    });

    describe('in / nin', () => {
        it('in passes when value is in array', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'in', value: ['article', 'blog'] }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('in fails when value is not in array', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'in', value: ['blog', 'page'] }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });

        it('nin passes when value is not in array', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'nin', value: ['blog', 'page'] }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('nin fails when value is in array', () => {
            expect(
                evaluateFilters(
                    [{ field: 'modelId', operator: 'nin', value: ['article', 'blog'] }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });

        it('in accepts comma-separated string value (CLI style)', () => {
            const filters: WebhookFilter[] = [
                { field: 'modelId', operator: 'in', value: 'article, blog' }
            ];
            expect(
                evaluateFilters(
                    filters,
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('in with string value trims and splits correctly', () => {
            const filters: WebhookFilter[] = [
                { field: 'modelId', operator: 'in', value: '  blog  ,  article  ' }
            ];
            expect(
                evaluateFilters(
                    filters,
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
        });

        it('nin with string value excludes matched', () => {
            const filters: WebhookFilter[] = [
                { field: 'modelId', operator: 'nin', value: 'blog,article' }
            ];
            expect(
                evaluateFilters(
                    filters,
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });
    });

    describe('environment and source (context)', () => {
        it('filters by environment', () => {
            expect(
                evaluateFilters(
                    [{ field: 'environment', operator: 'eq', value: 'staging' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    { ...baseContext, environment: 'staging' }
                )
            ).toBe(true);
            expect(
                evaluateFilters(
                    [{ field: 'environment', operator: 'eq', value: 'production' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    { ...baseContext, environment: 'staging' }
                )
            ).toBe(false);
        });

        it('filters by source', () => {
            expect(
                evaluateFilters(
                    [{ field: 'source', operator: 'eq', value: 'api' }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    { source: 'api' }
                )
            ).toBe(true);
            expect(
                evaluateFilters(
                    [{ field: 'source', operator: 'eq', value: 'studio' }],
                    'entry.created',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    { source: 'api' }
                )
            ).toBe(false);
        });
    });

    describe('locale (entry data)', () => {
        it('filters by locale', () => {
            expect(
                evaluateFilters(
                    [{ field: 'locale', operator: 'eq', value: 'en' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        locale: 'en',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
            expect(
                evaluateFilters(
                    [{ field: 'locale', operator: 'eq', value: 'fr' }],
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        locale: 'en',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });
    });

    describe('inapplicable fields (permissive)', () => {
        it('skips filter when field is missing on data (e.g. modelId on asset)', () => {
            const filters: WebhookFilter[] = [
                { field: 'modelId', operator: 'eq', value: 'article' }
            ];
            const assetData = {
                assetId: 'a1',
                filename: 'x.jpg',
                mimeType: 'image/jpeg',
                updatedBy: 'u1'
            };
            expect(evaluateFilters(filters, 'asset.created', assetData, baseContext)).toBe(true);
        });
    });

    describe('multiple filters', () => {
        it('all filters must pass', () => {
            const filters: WebhookFilter[] = [
                { field: 'modelId', operator: 'eq', value: 'article' },
                { field: 'status', operator: 'eq', value: 'published' }
            ];
            expect(
                evaluateFilters(
                    filters,
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'published',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(true);
            expect(
                evaluateFilters(
                    filters,
                    'entry.published',
                    {
                        entryId: 'e1',
                        modelId: 'article',
                        status: 'draft',
                        updatedBy: 'u1'
                    },
                    baseContext
                )
            ).toBe(false);
        });
    });
});
