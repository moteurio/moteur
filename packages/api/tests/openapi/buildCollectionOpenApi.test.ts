import { describe, it, expect } from 'vitest';
import { buildCollectionOpenApi } from '../../src/openapi/buildCollectionOpenApi.js';
import type { ApiCollection } from '@moteurio/types/ApiCollection.js';
import type { ModelSchema } from '@moteurio/types/Model.js';

const issueModel: ModelSchema = {
    id: 'issue',
    label: 'Issue',
    fields: {
        title: { type: 'core/text', label: 'Title', options: { multilingual: true } },
        slug: { type: 'core/slug', label: 'Slug' },
        cover: { type: 'core/image', label: 'Cover' }
    }
};

describe('buildCollectionOpenApi', () => {
    it('generates concrete paths and entry.data schemas per model resource', () => {
        const collection: ApiCollection = {
            id: 'public',
            projectId: 'demo',
            label: 'Site public',
            resources: [
                {
                    resourceType: 'model',
                    resourceId: 'issue',
                    fields: ['title', 'slug'],
                    resolve: 1
                },
                { resourceType: 'page', resourceId: 'pages' }
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z'
        };
        const doc = buildCollectionOpenApi({
            projectId: 'demo',
            collection,
            modelsById: new Map([['issue', issueModel]]),
            serverUrl: '/'
        });

        expect(doc.info?.title).toContain('Site public');
        expect(doc.paths?.['/projects/demo/collections/public/issue/entries']?.get).toBeDefined();
        expect(doc.paths?.['/projects/demo/collections/public/pages']?.get).toBeDefined();

        const entrySchema = doc.components?.schemas?.Entry_issue as {
            properties?: { data?: { properties?: Record<string, unknown> } };
        };
        expect(entrySchema?.properties?.data?.properties).toHaveProperty('title');
        expect(entrySchema?.properties?.data?.properties).toHaveProperty('slug');
        expect(entrySchema?.properties?.data?.properties).not.toHaveProperty('cover');
    });

    it('expands resourceId "models" into one path group per project model', () => {
        const articles: ModelSchema = {
            id: 'articles',
            label: 'Articles',
            fields: { title: { type: 'core/text', label: 'Title' } }
        };
        const collection: ApiCollection = {
            id: 'web',
            projectId: 'demo',
            label: 'Web',
            resources: [{ resourceType: 'model', resourceId: 'models' }],
            createdAt: '',
            updatedAt: ''
        };
        const doc = buildCollectionOpenApi({
            projectId: 'demo',
            collection,
            modelsById: new Map([
                ['issue', issueModel],
                ['articles', articles]
            ]),
            serverUrl: '/'
        });
        expect(doc.paths?.['/projects/demo/collections/web/issue/entries']?.get).toBeDefined();
        expect(doc.paths?.['/projects/demo/collections/web/articles/entries']?.get).toBeDefined();
        expect(doc.tags?.map(t => t.name)).toEqual(['channel', 'articles', 'issue']);
    });

    it('lets an explicit model row override "every model" for that model', () => {
        const collection: ApiCollection = {
            id: 'web',
            projectId: 'demo',
            label: 'Web',
            resources: [
                { resourceType: 'model', resourceId: 'models' },
                { resourceType: 'model', resourceId: 'issue', fields: ['title'] }
            ],
            createdAt: '',
            updatedAt: ''
        };
        const doc = buildCollectionOpenApi({
            projectId: 'demo',
            collection,
            modelsById: new Map([['issue', issueModel]]),
            serverUrl: '/'
        });
        const data = (
            doc.components?.schemas?.Entry_issue as {
                properties?: { data?: { properties?: Record<string, unknown> } };
            }
        ).properties?.data?.properties;
        expect(Object.keys(data ?? {})).toEqual(['title']);
    });
});
