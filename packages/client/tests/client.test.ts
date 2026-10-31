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
let lastAxiosCreateConfig: Record<string, unknown> | undefined;
/** What `GET /keys/me` says. */
let keyAnswer: Record<string, unknown> = {
    projectId: 'from-key',
    keyId: 'k1',
    channels: ['site'],
    channel: 'site',
    siteWide: true
};

vi.mock('axios', () => ({
    default: {
        create(config: Record<string, unknown>) {
            lastAxiosCreateConfig = config;
            const baseURL = (config.baseURL as string) ?? '';
            const headers = { ...(config.headers as Record<string, string>) };
            // Like axios: every request interceptor, the last one added first, possibly async.
            const requestInterceptors: Array<(c: Record<string, unknown>) => unknown> = [];
            return {
                interceptors: {
                    request: {
                        use(fn: (c: Record<string, unknown>) => unknown) {
                            requestInterceptors.unshift(fn);
                        }
                    },
                    response: { use: () => {} }
                },
                async request(options: Record<string, unknown>) {
                    let c: Record<string, unknown> = {
                        ...options,
                        baseURL,
                        headers: { ...headers, ...(options.headers as Record<string, string>) }
                    };
                    for (const fn of requestInterceptors)
                        c = (await fn(c)) as Record<string, unknown>;
                    capturedRequests.push({
                        method: (c.method as string) ?? 'get',
                        url: c.url as string,
                        params: c.params,
                        data: c.data,
                        headers: c.headers,
                        responseType: c.responseType
                    });
                    const data =
                        c.url === '/keys/me'
                            ? keyAnswer
                            : c.responseType === 'text'
                              ? '<?xml version="1.0"?><urlset></urlset>'
                              : {};
                    return { data, status: 200 };
                },
                get(url: string, opts?: Record<string, unknown>) {
                    return this.request({ method: 'get', url, ...opts });
                },
                post(url: string, data?: unknown, opts?: Record<string, unknown>) {
                    return this.request({ method: 'post', url, data, ...opts });
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
        expect(client).toHaveProperty('operator');
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

    it('auth.passkeys calls the passkey routes', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        const answer = {
            id: 'cred',
            rawId: 'cred',
            type: 'public-key' as const,
            response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
            clientExtensionResults: {}
        };
        await client.auth.passkeys.signInOptions();
        await client.auth.passkeys.signInOptions({ email: 'louise@journal.test' });
        await client.auth.passkeys.signIn(answer);
        await client.auth.passkeys.list();
        await client.auth.passkeys.registrationOptions();
        await client.auth.passkeys.register(
            { ...answer, response: { clientDataJSON: 'a', attestationObject: 'd' } },
            'Phone'
        );
        await client.auth.passkeys.rename('a/b', 'Laptop');
        await client.auth.passkeys.remove('cred');
        expect(capturedRequests.map(r => `${r.method} ${r.url}`)).toEqual([
            'post /auth/passkeys/sign-in/options',
            'post /auth/passkeys/sign-in/options',
            'post /auth/passkeys/sign-in/verify',
            'get /auth/passkeys',
            'post /auth/passkeys/register/options',
            'post /auth/passkeys/register/verify',
            'patch /auth/passkeys/a%2Fb',
            'delete /auth/passkeys/cred'
        ]);
        expect(capturedRequests[1].data).toEqual({ email: 'louise@journal.test' });
        expect(capturedRequests[2].data).toEqual({ response: answer });
        expect(capturedRequests[5].data).toMatchObject({ name: 'Phone' });
        expect(capturedRequests[6].data).toEqual({ name: 'Laptop' });
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

    it('sends an authoring version when saving an entry conditionally', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.entries.update(
            'my-project',
            'posts',
            'e1',
            { data: { title: 'New' } },
            { version: 'opaque-version' }
        );
        expect(capturedRequests[0]).toMatchObject({
            method: 'PATCH',
            url: '/projects/my-project/models/posts/entries/e1',
            headers: { 'If-Match': '"opaque-version"' },
            data: { data: { title: 'New' } }
        });
    });

    it('entries.create calls POST with body', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.entries.create('p1', 'posts', { title: 'Hello' });
        expect(capturedRequests[0].method).toBe('post');
        expect(capturedRequests[0].url).toBe('/projects/p1/models/posts/entries');
        expect(capturedRequests[0].data).toEqual({ title: 'Hello' });
    });

    it('assets.upload sends the form as multipart, not JSON', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        const form = new FormData();
        form.append('file', 'png');
        await client.assets.upload('demo', form);
        expect(capturedRequests[0].method).toBe('post');
        expect(capturedRequests[0].url).toBe('/projects/demo/assets');
        expect(capturedRequests[0].data).toBe(form);
        expect((capturedRequests[0].headers as Record<string, string>)['Content-Type']).toBe(
            'multipart/form-data'
        );
    });

    it('assets.usage and usageCounts call the usage routes', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        await client.assets.usageCounts('demo');
        await client.assets.usage('demo', 'a 1');
        expect(capturedRequests.map(r => r.url)).toEqual([
            '/projects/demo/assets/usage',
            '/projects/demo/assets/a%201/usage'
        ]);
    });

    it('pages come back as { page }, and moves are posted as a list', async () => {
        const client = createMoteurAdminClient({ baseURL: 'https://api.example.com' });
        expect(await client.pages.get('demo', 'p1')).toEqual({ page: {} });
        await client.forProject('demo').pages.reorder([{ id: 'p1', parentId: null, order: 0 }]);
        expect(capturedRequests[1]).toMatchObject({
            method: 'post',
            url: '/projects/demo/pages/reorder',
            data: [{ id: 'p1', parentId: null, order: 0 }]
        });
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
        lastAxiosCreateConfig = undefined;
    });

    it('needs only the key: it asks once which project and channel it reads', async () => {
        const moteur = createMoteurPublicClient({ apiKey: 'mk_live_x' });
        expect(moteur.baseURL).toBe('https://api.moteur.io');
        await moteur.channel().pages.list();
        await moteur.locale('fr').site.urls();
        await moteur.channel('blog').entries.list('post');
        expect(capturedRequests.map(r => r.url)).toEqual([
            '/keys/me',
            '/projects/from-key/channels/site/pages',
            '/projects/from-key/urls',
            '/projects/from-key/channels/blog/post/entries'
        ]);
        expect(capturedRequests[1]!.headers?.['x-api-key']).toBe('mk_live_x');
        expect(moteur.projectId).toBe('from-key');
    });

    it('asks to name a channel when the key reads several', async () => {
        const before = keyAnswer;
        keyAnswer = { projectId: 'p', keyId: 'k', channels: ['blog', 'shop'], siteWide: false };
        try {
            const moteur = createMoteurPublicClient({ apiKey: 'mk_live_y' });
            await expect(moteur.channel().pages.list()).rejects.toThrow(
                /name one, channel\('blog'\)/
            );
            await moteur.channel('shop').pages.list();
            expect(capturedRequests.at(-1)!.url).toBe('/projects/p/channels/shop/pages');
        } finally {
            keyAnswer = before;
        }
    });

    it('asks nothing when the project and channel are given', async () => {
        const moteur = createMoteurPublicClient({ apiKey: 'k', projectId: 'p1', channel: 'web' });
        await moteur.channel().pages.list();
        expect(capturedRequests.map(r => r.url)).toEqual(['/projects/p1/channels/web/pages']);
    });

    it('throws without a key', () => {
        expect(() => createMoteurPublicClient({ apiKey: ' ' })).toThrow(MoteurClientError);
    });

    it('throws when apiKey is missing', () => {
        expect(() =>
            createMoteurPublicClient({
                baseURL: 'https://api.example.com',
                auth: { type: 'apiKey', apiKey: '   ', projectId: 'p' }
            })
        ).toThrow(MoteurClientError);
    });

    it('channels.list uses project channels path', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'my-project' }
        });
        await client.channels.list();
        expect(capturedRequests[0].method).toBe('get');
        expect(capturedRequests[0].url).toBe('/projects/my-project/channels');
    });

    it('channel(channelId).entries.list uses the channel path', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        await client.channel('web').entries.list('posts');
        expect(capturedRequests[0].url).toBe('/projects/p1/channels/web/posts/entries');
    });

    it('locale() asks every read in its language; a call may ask another', async () => {
        const fr = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        }).locale('fr');
        expect(fr.language).toBe('fr');
        await fr.channel('site').pages.list({ resolveAssets: true });
        await fr.channel('site').entries.get('post', 'hello', { locale: 'en' });
        await fr.channel('site').menus.get('header');
        await fr.site.urls();
        expect(capturedRequests.map(r => [r.url, r.params])).toEqual([
            ['/projects/p1/channels/site/pages', { locale: 'fr', resolveAssets: '1' }],
            ['/projects/p1/channels/site/post/entries/hello', { locale: 'en' }],
            ['/projects/p1/channels/site/menus/header', { locale: 'fr' }],
            ['/projects/p1/urls', { locale: 'fr' }]
        ]);
    });

    it('without a locale, reads ask for none', async () => {
        const client = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        });
        await client.channel('site').pages.getBySlug('pricing');
        expect(capturedRequests[0]).toMatchObject({
            url: '/projects/p1/channels/site/pages/by-slug/pricing'
        });
        expect(capturedRequests[0].params).toBeUndefined();
    });

    it('schema() reads the channel’s schema, in every language', async () => {
        const fr = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        }).locale('fr');
        await fr.channel('site').schema();
        expect(capturedRequests[0].url).toBe('/projects/p1/channels/site/schema');
        expect(capturedRequests[0].params).toBeUndefined();
    });

    it('a preview copy keeps its language', async () => {
        const fr = createMoteurPublicClient({
            baseURL: 'https://api.example.com',
            auth: { type: 'apiKey', apiKey: 'k', projectId: 'p1' }
        })
            .locale('fr')
            .withPreview('tok');
        await fr.channel('site').pages.list();
        expect(capturedRequests[0].params).toEqual({ locale: 'fr' });
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

describe('entryListQuery', () => {
    it('writes list parameters the API reads', async () => {
        const { entryListQuery } = await import('../src/project/entries.js');
        expect(
            entryListQuery({
                limit: 50,
                offset: 0,
                sort: 'data.title',
                sortLocale: 'fr',
                q: '  glace ',
                filters: { issue: ['n5', 'n6'], $workflow: ['edits'], author: [] },
                missing: { field: 'title', locales: ['en'] },
                group: { key: 'issue', order: ['n6', 'n5'] },
                facets: ['issue', '$workflow'],
                missingCounts: { field: 'title', locales: ['fr', 'en'] },
                fields: ['title', 'cover']
            })
        ).toEqual({
            limit: 50,
            offset: 0,
            sort: 'data.title',
            sortLocale: 'fr',
            q: 'glace',
            'filter.issue': 'n5,n6',
            'filter.$workflow': 'edits',
            missing: 'title:en',
            group: 'issue',
            groupOrder: 'n6,n5',
            facets: 'issue,$workflow',
            missingCounts: 'title:fr,en',
            fields: 'title,cover'
        });
        expect(entryListQuery()).toEqual({});
    });
});
