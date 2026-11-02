// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { pick, qrSvg, qrText, render, renderQr, registerMoteurQrElement } from '../src/index.js';

describe('the QR block on a site', () => {
    it('reads the text and caption in the language asked for, else the first there is', () => {
        const data = {
            payload: { text: { fr: 'https://ex.fr', en: 'https://ex.com' } },
            caption: { en: 'Scan me' }
        };
        expect(qrText(data, 'en')).toBe('https://ex.com');
        expect(qrText(data, 'de')).toBe('https://ex.fr');
        expect(qrText({ payload: { text: 'plain' } })).toBe('plain');
        expect(pick({ fr: 'Scannez' }, 'en')).toBe('Scannez');
    });

    it('draws a scannable code: the SVG holds exactly the dark modules of the text', () => {
        const svg = qrSvg('HELLO', { size: 200, margin: 2 });
        const { modules } = QRCode.create('HELLO', { errorCorrectionLevel: 'M' });
        const dark = modules.data.reduce((n, v) => n + (v ? 1 : 0), 0);
        const drawn = [...svg.matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);
        expect(drawn).toBe(dark);
        expect(svg).toContain(`viewBox="0 0 ${modules.size + 4} ${modules.size + 4}"`);
        expect(svg).toContain('width="200"');
    });

    it('links what it encodes when that is a link, and says what it is', () => {
        const html = renderQr({ payload: { text: 'https://moteur.io' }, caption: 'Our site' });
        expect(html).toMatch(/^<figure class="moteur-qr"><a href="https:\/\/moteur.io"><svg/);
        expect(html).toContain('aria-label="QR code: https://moteur.io"');
        expect(html).toContain('<figcaption>Our site</figcaption>');
        expect(renderQr({ payload: { text: 'Table 12' } })).not.toContain('<a ');
        expect(renderQr({ payload: { text: 'javascript:alert(1)' } })).not.toContain('<a ');
    });

    it('escapes everything it writes, and draws nothing without text', () => {
        const html = renderQr({
            payload: { text: '"><img src=x onerror=alert(1)>' },
            caption: '<b>hi</b>'
        });
        expect(html).not.toContain('<img');
        expect(html).not.toContain('<b>');
        expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
        expect(renderQr({ payload: { text: '  ' } })).toBe('');
        expect(render({ type: 'play/qr', data: {} }, 'en')).toBe('');
    });

    it('works as <moteur-qr>, redrawn when its attributes change', () => {
        registerMoteurQrElement();
        registerMoteurQrElement();
        const el = document.createElement('moteur-qr');
        el.setAttribute('text', 'Table 12');
        document.body.append(el);
        expect(el.querySelector('svg')?.getAttribute('aria-label')).toBe('QR code: Table 12');
        el.setAttribute('size', '128');
        expect(el.querySelector('svg')?.getAttribute('width')).toBe('128');
    });
});
