/* global FormData, File */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Session } from '@moteurio/commands';
import type { MoteurAdminClient } from '@moteurio/client';
import { createServer, type ServerOptions } from '../src/server.js';

/** A fake API recording uploads (their file's name, type and bytes) and imports. */
function fakeApi() {
    const uploads: { name: string; type: string; text: string; alt?: unknown }[] = [];
    const imports: unknown[] = [];
    const requests: unknown[] = [];
    const client = {
        request: async (options: unknown) => (requests.push(options), 'id,answer\n1,hi'),
        assets: {
            upload: async (_p: string, form: FormData) => {
                const file = form.get('file') as File;
                uploads.push({
                    name: file.name,
                    type: file.type,
                    text: await file.text(),
                    alt: form.get('alt') ?? undefined
                });
                return { id: 'a1' };
            },
            import: async (_p: string, body: unknown) => (imports.push(body), { id: 'a2' }),
            replace: async (_p: string, _id: string, form: FormData) => {
                const file = form.get('file') as File;
                uploads.push({ name: file.name, type: file.type, text: await file.text() });
                return { id: 'a1' };
            }
        }
    } as unknown as MoteurAdminClient;
    const session = (body: Record<string, unknown>): Session => ({
        client: async () => client,
        defaultProject: async () => 'demo',
        body: async () => body
    });
    return { uploads, imports, requests, session };
}

async function connect(options: ServerOptions) {
    const server = createServer({ routes: false, ...options });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}

const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;
const secret = path.join(os.tmpdir(), `moteur-hosted-${process.pid}.txt`);
fs.writeFileSync(secret, 'server secret');

describe('a hosted server (its disk is not the caller’s)', () => {
    it('offers no argument naming a path on disk', async () => {
        const client = await connect({ local: false, session: fakeApi().session });
        const { tools } = await client.listTools();
        const props = (name: string) =>
            Object.keys(
                (tools.find(t => t.name === name)!.inputSchema as { properties: object }).properties
            );
        expect(props('media_upload')).not.toContain('files');
        expect(props('media_upload')).toEqual(expect.arrayContaining(['content', 'name', 'url']));
        expect(props('media_replace')).not.toContain('file');
        expect(props('submissions_export')).not.toContain('out');
    });

    it('refuses a path even when asked, and reads nothing', async () => {
        const api = fakeApi();
        const client = await connect({ local: false, session: api.session });
        const read = await client.callTool({
            name: 'media_upload',
            arguments: { files: [secret] }
        });
        expect(read.isError).toBe(true);
        expect(textOf(read)).toMatch(/Unknown option/);
        const wrote = await client.callTool({
            name: 'submissions_export',
            arguments: { form: 'contact', out: path.join(os.tmpdir(), 'moteur-out.csv') }
        });
        expect(wrote.isError).toBe(true);
        expect(api.uploads).toEqual([]);
        expect(api.requests).toEqual([]);
    });

    it('stays non-local whatever session the host gives', async () => {
        const api = fakeApi();
        const client = await connect({
            local: false,
            session: body => ({ ...api.session(body), local: true }),
            commands: undefined
        });
        const r = await client.callTool({ name: 'media_upload', arguments: { files: [secret] } });
        expect(r.isError).toBe(true);
        expect(api.uploads).toEqual([]);
    });

    it('takes a file inline, in base64 or as a data: URL', async () => {
        const api = fakeApi();
        const client = await connect({ local: false, session: api.session });
        const r = await client.callTool({
            name: 'media_upload',
            arguments: {
                content: `data:image/png;base64,${Buffer.from('png bytes').toString('base64')}`,
                name: 'inbox.png',
                alt: 'The inbox'
            }
        });
        expect(r.isError).toBeFalsy();
        expect(api.uploads).toEqual([
            { name: 'inbox.png', type: 'image/png', text: 'png bytes', alt: 'The inbox' }
        ]);
        const bad = await client.callTool({
            name: 'media_upload',
            arguments: { content: 'not base64!', name: 'x.png' }
        });
        expect(textOf(bad)).toMatch(/not base64/);
        const nameless = await client.callTool({
            name: 'media_upload',
            arguments: { content: 'aGk=' }
        });
        expect(textOf(nameless)).toMatch(/name/);
    });

    it('takes a public address, for the server to download', async () => {
        const api = fakeApi();
        const client = await connect({ local: false, session: api.session });
        await client.callTool({
            name: 'media_upload',
            arguments: { url: 'https://example.com/inbox.png', folder: 'shots' }
        });
        expect(api.imports).toEqual([{ url: 'https://example.com/inbox.png', folder: 'shots' }]);
    });

    it('wants exactly one source', async () => {
        const client = await connect({ local: false, session: fakeApi().session });
        const none = await client.callTool({ name: 'media_upload', arguments: {} });
        expect(textOf(none)).toBe('Give one of content or url.');
        const both = await client.callTool({
            name: 'media_upload',
            arguments: { url: 'https://example.com/a.png', content: 'aGk=', name: 'a.png' }
        });
        expect(both.isError).toBe(true);
    });
});

describe('a local server (the person’s own machine)', () => {
    it('still reads files from disk', async () => {
        const api = fakeApi();
        const client = await connect({ session: api.session });
        const r = await client.callTool({ name: 'media_upload', arguments: { files: [secret] } });
        expect(r.isError).toBeFalsy();
        expect(api.uploads[0]).toMatchObject({ text: 'server secret' });
    });
});
