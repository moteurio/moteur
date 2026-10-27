import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { downloadPublicFile } from '../src/utils/publicDownload.js';

// Plain http to localhost is allowed outside production only: enough to serve test files.
let base = '';
const server = http.createServer((req, res) => {
    if (req.url === '/shots/inbox.png') {
        res.writeHead(200, { 'Content-Type': 'image/png; charset=binary' });
        return void res.end('png bytes');
    }
    if (req.url === '/big') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return void res.end(Buffer.alloc(2048));
    }
    if (req.url === '/moved') {
        res.writeHead(302, { Location: '/shots/inbox.png' });
        return void res.end();
    }
    if (req.url === '/inside') {
        res.writeHead(302, { Location: 'https://10.0.0.7/secret' });
        return void res.end();
    }
    if (req.url === '/loop') {
        res.writeHead(302, { Location: '/loop' });
        return void res.end();
    }
    res.writeHead(404);
    res.end();
});

beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe('downloadPublicFile', () => {
    it('downloads a file, named after its address, typed by its server', async () => {
        const file = await downloadPublicFile(`${base}/shots/inbox.png`, { maxBytes: 1024 });
        expect(file).toMatchObject({ name: 'inbox.png', mimeType: 'image/png' });
        expect(file.buffer.toString()).toBe('png bytes');
    });

    it('follows a redirect', async () => {
        const file = await downloadPublicFile(`${base}/moved`, { maxBytes: 1024 });
        expect(file.name).toBe('inbox.png');
    });

    it('refuses a file over the size', async () => {
        await expect(downloadPublicFile(`${base}/big`, { maxBytes: 1024 })).rejects.toThrow(
            'too large'
        );
    });

    it('refuses a redirect into a private network', async () => {
        await expect(downloadPublicFile(`${base}/inside`, { maxBytes: 1024 })).rejects.toThrow(
            /private or restricted/
        );
    });

    it('refuses private, metadata and plain-http addresses', async () => {
        for (const url of [
            'https://10.0.0.7/x.png',
            'https://169.254.169.254/latest/meta-data',
            'https://[::1]/x.png',
            'http://example.com/x.png',
            'file:///etc/passwd'
        ])
            await expect(downloadPublicFile(url, { maxBytes: 1024 })).rejects.toThrow();
    });

    it('stops after a few redirects, and on errors', async () => {
        await expect(downloadPublicFile(`${base}/loop`, { maxBytes: 1024 })).rejects.toThrow(
            'too many'
        );
        await expect(downloadPublicFile(`${base}/gone`, { maxBytes: 1024 })).rejects.toThrow('404');
    });
});
