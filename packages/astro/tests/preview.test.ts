import { describe, expect, it, vi } from 'vitest';
import { previewPage } from '../src/preview.js';

const pages: Record<string, { path: string; templateId: string }[]> = {
    en: [
        { path: '/', templateId: 'home' },
        { path: '/about', templateId: 'page' }
    ],
    fr: [{ path: '/fr/a-propos', templateId: 'page' }]
};

function fakeClient(fail?: number) {
    const tokens: string[] = [];
    const channel = {
        schema: async () => ({ locales: ['en', 'fr'] }),
        pages: {
            list: async ({ locale }: { locale: string }) => {
                if (fail) throw Object.assign(new Error('no'), { status: fail });
                return pages[locale];
            }
        }
    };
    return {
        tokens,
        client: { withPreview: (t: string) => (tokens.push(t), { channel: () => channel }) }
    };
}

const astro = (url: string) => ({ url: new URL(url), response: { headers: new Headers() } });

describe('previewPage', () => {
    it('finds the page at the address under /preview, in its language, with the token', async () => {
        const { client, tokens } = fakeClient();
        const a = astro('https://site.test/preview/fr/a-propos?preview=tok');
        const page = await previewPage(a, { client: client as never });
        expect(page).toMatchObject({ path: '/fr/a-propos', locale: 'fr' });
        expect(tokens).toEqual(['tok']);
    });

    it('reads /preview itself as the home page', async () => {
        const { client } = fakeClient();
        const page = await previewPage(astro('https://site.test/preview?preview=tok'), {
            client: client as never
        });
        expect(page).toMatchObject({ path: '/', locale: 'en' });
    });

    it('is never cached, indexed, or sent on as a referrer', async () => {
        const a = astro('https://site.test/preview/about');
        expect(await previewPage(a, { client: fakeClient().client as never })).toBeNull();
        expect(a.response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(a.response.headers.get('X-Robots-Tag')).toBe('noindex');
        expect(a.response.headers.get('Referrer-Policy')).toBe('no-referrer');
    });

    it('gives null for an expired token or an address no page has, and throws on the rest', async () => {
        const url = 'https://site.test/preview/about?preview=old';
        expect(
            await previewPage(astro(url), { client: fakeClient(401).client as never })
        ).toBeNull();
        expect(
            await previewPage(astro('https://site.test/preview/nope?preview=t'), {
                client: fakeClient().client as never
            })
        ).toBeNull();
        await expect(
            previewPage(astro(url), { client: fakeClient(500).client as never })
        ).rejects.toThrow();
    });

    it('takes another base', async () => {
        const page = await previewPage(astro('https://site.test/drafts/about?preview=t'), {
            client: fakeClient().client as never,
            base: '/drafts/'
        });
        expect(page).toMatchObject({ path: '/about' });
        vi.restoreAllMocks();
    });
});
