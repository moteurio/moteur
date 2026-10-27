import { describe, it, expect, vi } from 'vitest';
import type { MoteurClient } from '../src/client.js';
import { MoteurApiError } from '../src/client.js';
import { publicSiteOutputsApi } from '../src/public/pageOutputs.js';
import { projectRedirectsApi } from '../src/project/redirects.js';
import { projectPagesApi } from '../src/project/pages.js';

function fakeClient() {
    return {
        get: vi.fn().mockResolvedValue([]),
        post: vi.fn().mockResolvedValue({ id: 'r1' }),
        patch: vi.fn().mockResolvedValue({ id: 'r1' }),
        delete: vi.fn().mockResolvedValue(undefined),
        request: vi.fn()
    };
}

describe('addresses in every language', () => {
    it('asks for one language when given, and every language otherwise', async () => {
        const client = fakeClient();
        const site = publicSiteOutputsApi(client as unknown as MoteurClient, 'demo');
        await site.urls({ locale: 'fr' });
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/urls', { locale: 'fr' });
        await site.urls();
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/urls', {});
        await site.navigation({ depth: 2, locale: 'fr' });
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/navigation', {
            locale: 'fr',
            depth: 2
        });
        await site.breadcrumb({ pageId: 'p1', locale: 'fr' });
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/breadcrumb', {
            pageId: 'p1',
            locale: 'fr'
        });

        const pages = projectPagesApi(client as unknown as MoteurClient);
        await pages.getBySlug('demo', 'a-propos', 'fr');
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/pages/by-slug/a-propos', {
            locale: 'fr'
        });
    });

    it('resolves a path, and answers null when nothing lives there', async () => {
        const client = fakeClient();
        const site = publicSiteOutputsApi(client as unknown as MoteurClient, 'demo');
        client.get.mockResolvedValueOnce({ match: 'redirect', from: '/a', to: '/b', status: 301 });
        expect(await site.resolve('/a')).toMatchObject({ match: 'redirect', to: '/b' });
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/resolve', { path: '/a' });

        client.get.mockRejectedValueOnce(new MoteurApiError('Not found', { status: 404 }));
        expect(await site.resolve('/x')).toBeNull();

        client.get.mockRejectedValueOnce(new MoteurApiError('Down', { status: 503 }));
        await expect(site.resolve('/x')).rejects.toThrow('Down');
    });

    it('manages redirects', async () => {
        const client = fakeClient();
        const api = projectRedirectsApi(client as unknown as MoteurClient);
        await api.list('my proj');
        expect(client.get).toHaveBeenCalledWith('/projects/my%20proj/redirects');
        await api.create('p', { from: '/a', to: '/b', status: 302 });
        expect(client.post).toHaveBeenCalledWith('/projects/p/redirects', {
            from: '/a',
            to: '/b',
            status: 302
        });
        await api.update('p', 'r 1', { to: '/c' });
        expect(client.patch).toHaveBeenCalledWith('/projects/p/redirects/r%201', { to: '/c' });
        await api.delete('p', 'r1');
        expect(client.delete).toHaveBeenCalledWith('/projects/p/redirects/r1');
    });
});
