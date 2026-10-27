import { describe, it, expect } from 'vitest';
import { buildChannelOpenApi } from '../../src/openapi/buildChannelOpenApi.js';
import type { Channel } from '@moteurio/types/Channel.js';
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

describe('buildChannelOpenApi', () => {
    it('generates concrete paths and entry.data schemas per model resource', () => {
        const channel: Channel = {
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
        const doc = buildChannelOpenApi({
            projectId: 'demo',
            channel,
            modelsById: new Map([['issue', issueModel]]),
            serverUrl: '/'
        });

        expect(doc.info?.title).toContain('Site public');
        expect(doc.paths?.['/projects/demo/channels/public/issue/entries']?.get).toBeDefined();
        expect(doc.paths?.['/projects/demo/channels/public/pages']?.get).toBeDefined();

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
        const channel: Channel = {
            id: 'web',
            projectId: 'demo',
            label: 'Web',
            resources: [{ resourceType: 'model', resourceId: 'models' }],
            createdAt: '',
            updatedAt: ''
        };
        const doc = buildChannelOpenApi({
            projectId: 'demo',
            channel,
            modelsById: new Map([
                ['issue', issueModel],
                ['articles', articles]
            ]),
            serverUrl: '/'
        });
        expect(doc.paths?.['/projects/demo/channels/web/issue/entries']?.get).toBeDefined();
        expect(doc.paths?.['/projects/demo/channels/web/articles/entries']?.get).toBeDefined();
        expect(doc.tags?.map(t => t.name)).toEqual(['channel', 'articles', 'issue']);
    });

    it('lets an explicit model row override "every model" for that model', () => {
        const channel: Channel = {
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
        const doc = buildChannelOpenApi({
            projectId: 'demo',
            channel,
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
