// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    render,
    renderOembed,
    registerMoteurOembedElement,
    type OembedBlockData
} from '../src/index.js';

const video: OembedBlockData = {
    url: 'https://youtu.be/x',
    caption: { en: 'The launch', fr: 'Le lancement' },
    embed: {
        title: 'A talk',
        provider_name: 'YouTube',
        iframe: {
            src: 'https://www.youtube.com/embed/x?a=1&b=2',
            width: 560,
            height: 315,
            allow: 'fullscreen'
        },
        html: '<iframe src="https://www.youtube.com/embed/x"></iframe>'
    }
};

describe('the embed block on a site', () => {
    it('builds the frame itself: titled, lazy, keeping its shape', () => {
        const html = renderOembed(video, 'fr');
        expect(html).toContain(
            '<iframe src="https://www.youtube.com/embed/x?a=1&amp;b=2" title="A talk" loading="lazy"'
        );
        expect(html).toContain('aspect-ratio: 560 / 315');
        expect(html).toContain('<figcaption>Le lancement</figcaption>');
    });

    it('shows a link card when there is no frame, and the provider HTML only when trusted', () => {
        const post: OembedBlockData = {
            url: 'https://x.com/a/status/1',
            embed: {
                title: 'A post',
                author_name: 'A',
                provider_name: 'X',
                html: '<blockquote>t</blockquote><script src="https://platform.x.com/w.js"></script>'
            }
        };
        const html = renderOembed(post);
        expect(html).not.toContain('<script');
        expect(html).toContain(
            '<a class="moteur-oembed__card" href="https://x.com/a/status/1" rel="noopener">'
        );
        expect(html).toContain('A · X');
        expect(renderOembed(post, undefined, { trustProviderHtml: true })).toContain('<script');
        // Not resolved (a provider down): still a working link.
        expect(render({ data: { url: 'https://example.com/page' } }, 'en')).toContain(
            'href="https://example.com/page"'
        );
    });

    it('escapes everything it writes, and draws nothing for a link that is not one', () => {
        const html = renderOembed({
            url: 'https://e.com/"><script>alert(1)</script>',
            caption: '<b>c</b>',
            embed: {
                title: '"><img src=x onerror=alert(1)>',
                thumbnail_url: 'javascript:alert(1)',
                iframe: { src: 'javascript:alert(1)' }
            }
        });
        expect(html).not.toMatch(/<script|<img|<b>|javascript:/);
        expect(renderOembed({ url: 'javascript:alert(1)' })).toBe('');
        expect(renderOembed(undefined)).toBe('');
    });

    it('works as <moteur-oembed>, from a property or JSON', () => {
        registerMoteurOembedElement();
        const el = document.createElement('moteur-oembed') as HTMLElement & {
            data?: OembedBlockData;
        };
        document.body.append(el);
        el.data = video;
        expect(el.querySelector('iframe')?.getAttribute('title')).toBe('A talk');
        el.setAttribute('data', JSON.stringify({ url: 'https://example.com' }));
        expect(el.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
        el.setAttribute('data', '{not json');
        expect(el.innerHTML).toBe('');
    });
});
