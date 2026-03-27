import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMoteurAdminClient,
    createMoteurPublicClient,
    MoteurClientError,
    MoteurApiError,
    DEFAULT_REQUEST_TIMEOUT_MS
} from '../src/index.js';

const capturedRequests: Array<{
    method: string;
    url: string;
    params?: unknown;
    data?: unknown;
    headers?: unknown;
    responseType?: unknown;
}> = [];
let requestInterceptor: (config: Record<string, unknown>) => Record<string, unknown> = c => c;
let lastAxiosCreateConfig: Record<string, unknown> | undefined;

vi.mock('axios', () => ({
    default: {
        create(config: Record<string, unknown>) {
            lastAxiosCreateConfig = config;
            const baseURL = (config.baseURL as string) ?? '';
            const headers = { ...(config.headers as Record<string, string>) };
            return {
                interceptors: {
                    request: {
                        use(fn: (c: Record<string, unknown>) => Record<string, unknown>) {
                            requestInterceptor = fn;
                        }
                    },
                    response: { use: () => {} }
                },
                request(options: Record<string, unknown>) {
                    const c = requestInterceptor({
                        ...options,
                        baseURL,
                        headers: { ...headers, ...(options.headers as Record<string, string>) }
                    });
                    capturedRequests.push({
                        method: (c.method as string) ?? 'get',
                        url: c.url as string,
                        params: c.params,
                        data: c.data,
                        headers: c.headers,
                        responseType: c.responseType
                    });
                    const data =
                        c.responseType === 'text' ? '<?xml version="1.0"?><urlset></urlset>' : {};
                    return Promise.resolve({ data, status: 200 });
                },
                get(url: string, opts?: Record<string, unknown>) {
                    return this.request({ method: 'get', url, ...opts });
                },
                post(url: string, data?: unknown) {
                    return this.request({ method: 'post', url, data });
                },
                patch(url: string, data?: unknown) {
                    return this.request({ method: 'patch', url, data });
                },
                put(url: string, data?: unknown) {
                    return this.request({ method: 'put', url, data });
                },
                delete(url: string) {
                    return this.request({ method: 'delete', url });
                }
            };
        }
    }
}));

describe('createMoteurAdminClient', () => {
    beforeEach(() => {
        capturedRequests.length = 0;
        requestInterceptor = c => c;
    });

    it('returns client with auth, projects, models, entries, resource APIs, instance, forProject, blueprints, activity', () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        expect(client).toHaveProperty('auth');
        expect(client).toHaveProperty('projects');
        expect(client).toHaveProperty('models');
        expect(client).toHaveProperty('entries');
        expect(client).toHaveProperty('pages');
        expect(client).toHaveProperty('templates');
        expect(client).toHaveProperty('instance');
        expect(client).toHaveProperty('forProject');
        expect(client).toHaveProperty('blueprints');
        expect(client).toHaveProperty('activity');
        expect(client.baseURL).toBe('https://api.example.com');
    });

    it('projects.list calls GET /projects', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.projects.list();
        expect(capturedRequests).toHaveLength(1);
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects');
    });

    it('projects.get calls GET /projects/:id', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.projects.get('my-blog');
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects/my-blog');
    });

    it('projects.create calls POST /projects with body', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.projects.create({ id: 'my-blog', label: 'My Blog' });
        expect(capturedRequests[0].method).toBe('post');
        expect(capturedRequests[0].url).toBe('/projects');
        expect(capturedRequests[0].data).toEqual({ id: 'my-blog', label: 'My Blog' });
    });

    it('auth.login calls POST /auth/login with username and password', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.auth.login('user', 'pass');
        expect(capturedRequests[0].method).toBe('post');
        expect(capturedRequests[0].url).toBe('/auth/login');
        expect(capturedRequests[0].data).toEqual({ username: 'user', password: 'pass' });
    });

    it('adds Authorization Bearer header when auth type is bearer', async () => {
        const client = createMoteurAdminClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'bearer', token: 'secret-jwt' }
        });
        await client.projects.list();
        expect(capturedRequests[0].headers).toMatchObject({ Authorization: 'Bearer secret-jwt' });
    });

    it('adds x-api-key header when auth type is apiKey', async () => {
        const client = createMoteurAdminClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'my-key' }
        });
        await client.projects.list();
        expect(capturedRequests[0].headers).toMatchObject({ 'x-api-key': 'my-key' });
    });

    it('models.list calls GET /projects/:id/models', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.models.list('my-project');
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects/my-project/models');
    });

    it('entries.list calls GET with project and model in path', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.entries.list('my-project', 'posts');
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects/my-project/models/posts/entries');
    });

    it('entries.create calls POST with body', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.entries.create('p1', 'posts', { title: 'Hello' });
        expect(capturedRequests[0].method).toBe('post');
        expect(capturedRequests[0].url).toBe('/projects/p1/models/posts/entries');
        expect(capturedRequests[0].data).toEqual({ title: 'Hello' });
    });

    it('forProject omits project id from paths', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.forProject('my-project').pages.list();
        expect(capturedRequests[0].url).toBe('/projects/my-project/pages');
    });

    it('blueprints.list calls GET /blueprints/:kind', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.blueprints.list('project');
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/blueprints/projects');
    });

    it('trims trailing slash from baseURL', () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com/' });
        expect(client.baseURL).toBe('https://api.example.com');
    });

    it('projects.radar.get passes scan=true when fullScan', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.projects.radar.get('p1', { fullScan: true });
        expect(capturedRequests[0].url).toBe('/projects/p1/radar');
        expect(capturedRequests[0].params).toEqual({ scan: 'true' });
    });

    it('passes default request timeout to axios', () => {
        createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        expect(lastAxiosCreateConfig?.timeout).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    });

    it('passes custom timeout to axios', () => {
        createMoteurAdminClient({ baseURL: 'https://api.example.com', timeout: 12_345 });
        expect(lastAxiosCreateConfig?.timeout).toBe(12_345);
    });

    it('timeout 0 omits axios timeout', () => {
        createMoteurAdminClient({ baseURL: 'https://api.example.com', timeout: 0 });
        expect(lastAxiosCreateConfig?.timeout).toBeUndefined();
    });
});

describe('createMoteurPublicClient', () => {
    beforeEach(() => {
        capturedRequests.length = 0;
        requestInterceptor = c => c;
        lastAxiosCreateConfig = undefined;
    });

    it('throws when projectId is missing', () => {
        expect(() =>
            createMoteurPublicClient({
                baseURL: 'https://api.example.com',
                auth: { type: 'apiKey', apiKey: 'k', projectId: '' }
            })
        ).toThrow(MoteurClientError);
    });

    it('throws when apiKey is missing', () => {
        expect(() =>
            createMoteurPublicClient({
                baseURL: 'https://api.example.com',
                auth: { type: 'apiKey', apiKey: '   ', projectId: 'p' }
            })
        ).toThrow(MoteurClientError);
    });

    it('collections.list uses project collections path', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'my-project' }
        });
        await client.collections.list();
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects/my-project/collections');
    });

    it('channel(collectionId).entries.list uses collection channel path', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        await client.channel('web').entries.list('posts');
        expect(capturedRequests[0].url).toBe('/projects/p1/collections/web/posts/entries');
    });

    it('site.sitemapXml uses GET with text responseType', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        const xml = await client.site.sitemapXml();
        expect(capturedRequests[0].url).toBe('/projects/p1/sitemap.xml');
        expect(capturedRequests[0].responseType).toBe('text');
        expect(xml).toContain('urlset');
    });

    it('site.navigation hits page output path', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        await client.site.navigation({ depth: 2 });
        expect(capturedRequests[0].url).toBe('/projects/p1/navigation');
        expect(capturedRequests[0].params).toEqual({ depth: 2 });
    });

    it('radar.get passes scan when fullScan', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        await client.radar.get({ fullScan: true });
        expect(capturedRequests[0].params).toEqual({ scan: 'true' });
    });
});

describe('MoteurApiError', () => {
    it('exposes status and response', () => {
        const err = new MoteurApiError('nope', { status: 418, response: { data: {} } });
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('MoteurApiError');
        expect(err.status).toBe(418);
        expect(err.response).toEqual({ data: {} });
    });
});
