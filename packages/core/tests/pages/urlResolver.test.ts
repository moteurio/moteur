import { describe, it, expect } from 'vitest';
import {
    buildNodeMap,
    buildChildMap,
    getAncestors,
    resolveNodePrefix,
    interpolatePattern,
    resolveBreadcrumb,
    buildNavigationTree,
    resolveAllUrls
} from '../../src/pages/urlResolver.js';
import type { StaticPage, CollectionPage, FolderPage } from '@moteurio/types/Page.js';
import type { Entry } from '@moteurio/types/Model.js';

function staticNode(overrides: Partial<StaticPage> & { id: string }): StaticPage {
    return {
        id: overrides.id,
        projectId: 'p1',
        type: 'static',
        label: overrides.label ?? 'Page',
        slug: overrides.slug ?? '',
        parentId: overrides.parentId ?? null,
        order: overrides.order ?? 0,
        navInclude: overrides.navInclude ?? true,
        sitemapInclude: overrides.sitemapInclude ?? true,
        sitemapPriority: overrides.sitemapPriority ?? 0.5,
        templateId: 't1',
        status: overrides.status ?? 'published',
        fields: overrides.fields ?? {},
        createdAt: '',
        updatedAt: ''
    };
}

function folderNode(overrides: Partial<FolderPage> & { id: string }): FolderPage {
    return {
        id: overrides.id,
        projectId: 'p1',
        type: 'folder',
        label: overrides.label ?? 'Folder',
        slug: overrides.slug ?? '',
        parentId: overrides.parentId ?? null,
        order: overrides.order ?? 0,
        navInclude: overrides.navInclude ?? true,
        sitemapInclude: overrides.sitemapInclude ?? true,
        sitemapPriority: 0.5,
        createdAt: '',
        updatedAt: ''
    };
}

function collectionNode(overrides: Partial<CollectionPage> & { id: string }): CollectionPage {
    return {
        id: overrides.id,
        projectId: 'p1',
        type: 'collection',
        label: overrides.label ?? 'Collection',
        slug: overrides.slug ?? '',
        parentId: overrides.parentId ?? null,
        order: overrides.order ?? 0,
        navInclude: overrides.navInclude ?? true,
        sitemapInclude: overrides.sitemapInclude ?? true,
        sitemapPriority: 0.5,
        templateId: 't1',
        status: overrides.status ?? 'published',
        fields: {},
        modelId: overrides.modelId ?? 'post',
        urlPattern: overrides.urlPattern,
        entryStatus: overrides.entryStatus ?? 'published',
        sitemapIncludeEntries: overrides.sitemapIncludeEntries ?? true,
        createdAt: '',
        updatedAt: ''
    };
}

describe('urlResolver', () => {
    describe('buildNodeMap', () => {
        it('builds id → node map', () => {
            const a = staticNode({ id: 'a', slug: 'a' });
            const b = staticNode({ id: 'b', slug: 'b' });
            const map = buildNodeMap([a, b]);
            expect(map.size).toBe(2);
            expect(map.get('a')).toBe(a);
            expect(map.get('b')).toBe(b);
        });
    });

    describe('buildChildMap', () => {
        it('groups by parentId and sorts by order', () => {
            const root = staticNode({ id: 'r', parentId: null, order: 0 });
            const c1 = staticNode({ id: 'c1', parentId: 'r', order: 1 });
            const c2 = staticNode({ id: 'c2', parentId: 'r', order: 0 });
            const map = buildChildMap([root, c1, c2]);
            const children = map.get('r')!;
            expect(children).toHaveLength(2);
            expect(children[0].id).toBe('c2');
            expect(children[1].id).toBe('c1');
            expect(map.get(null)).toHaveLength(1);
            expect(map.get(null)![0].id).toBe('r');
        });
    });

    describe('getAncestors', () => {
        it('returns ancestor chain from root to closest (root first, then immediate parent)', () => {
            const r = staticNode({ id: 'r', parentId: null });
            const a = staticNode({ id: 'a', parentId: 'r' });
            const b = staticNode({ id: 'b', parentId: 'a' });
            const map = buildNodeMap([r, a, b]);
            expect(getAncestors('b', map).map(n => n.id)).toEqual(['r', 'a']);
            expect(getAncestors('a', map).map(n => n.id)).toEqual(['r']);
            expect(getAncestors('r', map)).toEqual([]);
        });

        it('returns empty for unknown node', () => {
            const map = buildNodeMap([]);
            expect(getAncestors('x', map)).toEqual([]);
        });
    });

    describe('resolveNodePrefix', () => {
        it('concatenates slugs from root to node', () => {
            const r = staticNode({ id: 'r', parentId: null, slug: '' });
            const blog = staticNode({ id: 'blog', parentId: 'r', slug: 'blog' });
            const post = staticNode({ id: 'post', parentId: 'blog', slug: 'post' });
            const map = buildNodeMap([r, blog, post]);
            expect(resolveNodePrefix('r', map)).toBe('/');
            expect(resolveNodePrefix('blog', map)).toBe('/blog');
            expect(resolveNodePrefix('post', map)).toBe('/blog/post');
        });
    });

    describe('interpolatePattern', () => {
        it('replaces [field] with entry.data[field]', () => {
            const entry: Entry = {
                id: 'e1',
                type: 'post',
                data: { slug: 'hello-world', title: 'Hello' },
                status: 'published'
            };
            expect(interpolatePattern('[slug]', entry)).toBe('hello-world');
            expect(interpolatePattern('/[slug]', entry)).toBe('/hello-world');
            expect(interpolatePattern('[slug]/[title]', entry)).toBe('hello-world/Hello');
        });

        it('supports dot notation for nested data', () => {
            const entry: Entry = {
                id: 'e1',
                type: 'post',
                data: { category: { slug: 'news' }, slug: 'item' },
                status: 'published'
            };
            expect(interpolatePattern('[category.slug]/[slug]', entry)).toBe('news/item');
        });

        it('returns empty string for unknown field (never throws)', () => {
            const entry: Entry = { id: 'e1', type: 'post', data: {}, status: 'published' };
            expect(interpolatePattern('[missing]', entry)).toBe('');
            expect(interpolatePattern('[a.b.c]', entry)).toBe('');
        });
    });

    describe('resolveBreadcrumb', () => {
        it('returns breadcrumb from root to static page', () => {
            const r = staticNode({ id: 'r', parentId: null, slug: '', label: 'Home' });
            const blog = staticNode({ id: 'blog', parentId: 'r', slug: 'blog', label: 'Blog' });
            const map = buildNodeMap([r, blog]);
            const { url, breadcrumb } = resolveBreadcrumb('blog', map);
            expect(url).toBe('/blog');
            expect(breadcrumb).toHaveLength(2);
            expect(breadcrumb[0].label).toBe('Home');
            expect(breadcrumb[0].url).toBe('/');
            expect(breadcrumb[1].label).toBe('Blog');
            expect(breadcrumb[1].url).toBe('/blog');
        });

        it('returns empty for unknown node', () => {
            const map = buildNodeMap([]);
            const result = resolveBreadcrumb('x', map);
            expect(result.url).toBe('');
            expect(result.breadcrumb).toEqual([]);
        });
    });

    describe('buildNavigationTree', () => {
        it('includes only navInclude nodes and omits folders with no nav descendants', () => {
            const r = folderNode({ id: 'r', parentId: null, slug: '', navInclude: true });
            const blog = staticNode({ id: 'blog', parentId: 'r', slug: 'blog', navInclude: true });
            const hidden = staticNode({
                id: 'hidden',
                parentId: 'r',
                slug: 'h',
                navInclude: false
            });
            const nodes = [r, blog, hidden];
            const nodeMap = buildNodeMap(nodes);
            const childMap = buildChildMap(nodes);
            const tree = buildNavigationTree(nodes, nodeMap, childMap);
            expect(tree).toHaveLength(1); // one root (r); blog is child of r
            const folderInTree = tree.find(n => n.id === 'r');
            expect(folderInTree?.children).toHaveLength(1);
            expect(folderInTree?.children![0].id).toBe('blog');
        });
    });

    describe('resolveAllUrls', () => {
        it('emits one URL per published static page', async () => {
            const home = staticNode({ id: 'home', parentId: null, slug: '', status: 'published' });
            const about = staticNode({
                id: 'about',
                parentId: null,
                slug: 'about',
                status: 'published'
            });
            const draft = staticNode({
                id: 'draft',
                parentId: null,
                slug: 'draft',
                status: 'draft'
            });
            const getEntries = async () => [];
            const urls = await resolveAllUrls([home, about, draft], getEntries, 'p1');
            expect(urls.map(u => u.url).sort()).toEqual(['/', '/about']);
        });

        it('emits folder as no URL', async () => {
            const f = folderNode({ id: 'f', parentId: null, slug: 'folder' });
            const getEntries = async () => [];
            const urls = await resolveAllUrls([f], getEntries, 'p1');
            expect(urls).toHaveLength(0);
        });

        it('emits collection index and one URL per entry when pattern and sitemapIncludeEntries', async () => {
            const coll = collectionNode({
                id: 'blog',
                parentId: null,
                slug: 'blog',
                urlPattern: '[slug]',
                sitemapIncludeEntries: true
            });
            const getEntries = async (_pid: string, _mid: string) =>
                [
                    { id: 'e1', type: 'post', data: { slug: 'first' }, status: 'published' },
                    { id: 'e2', type: 'post', data: { slug: 'second' }, status: 'published' }
                ] as Entry[];
            const urls = await resolveAllUrls([coll], getEntries, 'p1');
            expect(urls).toHaveLength(3); // index + 2 entries
            const paths = urls.map(u => u.url).sort();
            expect(paths).toContain('/blog');
            expect(paths).toContain('/blog/first');
            expect(paths).toContain('/blog/second');
        });

        it('does not expand entries when sitemapIncludeEntries is false', async () => {
            const coll = collectionNode({
                id: 'blog',
                parentId: null,
                slug: 'blog',
                urlPattern: '[slug]',
                sitemapIncludeEntries: false
            });
            const getEntries = async () =>
                [
                    { id: 'e1', type: 'post', data: { slug: 'only' }, status: 'published' }
                ] as Entry[];
            const urls = await resolveAllUrls([coll], getEntries, 'p1');
            expect(urls).toHaveLength(1);
            expect(urls[0].url).toBe('/blog');
        });
    });
});
