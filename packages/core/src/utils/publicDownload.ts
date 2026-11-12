import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import path from 'node:path';
import { validateUrl } from '../webhooks/networkPolicy.js';

export type DownloadedFile = { buffer: Buffer; mimeType: string; name: string };

export type DownloadOptions = {
    maxBytes: number;
    timeoutMs?: number;
    /** Maximum number of redirects to follow. Each redirect target is checked like the first address. */
    maxRedirects?: number;
};

/** Returns the file name: the last segment of the address, or "download" if there is none. */
function nameOf(url: URL): string {
    const last = decodeURIComponent(path.posix.basename(url.pathname || '')).trim();
    return last && last !== '/' ? last : 'download';
}

/** Makes one GET request to a validated address pinned to the resolved IP. A redirect is returned as its location. */
function getOnce(
    url: URL,
    maxBytes: number,
    deadline: number
): Promise<{ redirect: string } | DownloadedFile> {
    return new Promise((resolve, reject) => {
        let request: ClientRequest | undefined;
        let response: IncomingMessage | undefined;
        let settled = false;
        const finish = (error?: Error, result?: { redirect: string } | DownloadedFile) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            response?.destroy();
            request?.destroy();
            if (error) reject(error);
            else resolve(result!);
        };
        const timer = setTimeout(
            () => finish(new Error('The download took too long')),
            Math.max(0, deadline - Date.now())
        );
        void (async () => {
            // Refuse private and restricted networks. This runs for every redirect hop.
            const target = await validateUrl(url.href);
            if (settled) return;
            request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
                url,
                {
                    method: 'GET',
                    agent: false,
                    family: target.family,
                    // Connect to the address that was already validated instead of doing a second DNS lookup, which prevents DNS rebinding.
                    lookup: (_hostname, _options, callback) =>
                        callback(null, target.address, target.family)
                },
                res => {
                    response = res;
                    const status = res.statusCode ?? 0;
                    if (status >= 300 && status < 400 && res.headers.location)
                        return finish(undefined, { redirect: res.headers.location });
                    if (status < 200 || status >= 300)
                        return finish(new Error(`The address answered ${status}`));
                    const declared = Number(res.headers['content-length']);
                    if (Number.isFinite(declared) && declared > maxBytes)
                        return finish(new Error('The file is too large'));
                    const chunks: Buffer[] = [];
                    let size = 0;
                    res.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > maxBytes) return finish(new Error('The file is too large'));
                        chunks.push(chunk);
                    });
                    res.on('end', () =>
                        finish(undefined, {
                            buffer: Buffer.concat(chunks),
                            mimeType:
                                String(res.headers['content-type'] ?? '')
                                    .split(';')[0]
                                    ?.trim() || 'application/octet-stream',
                            name: nameOf(url)
                        })
                    );
                    res.on('error', finish);
                    res.on('aborted', () => finish(new Error('The download was cut short')));
                }
            );
            request.on('error', finish);
            request.end();
        })().catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    });
}

/**
 * Downloads a file from an address a client supplied, for example a picture to add to the library.
 * Only HTTPS is allowed, and private or restricted network addresses are refused (this is checked
 * again after each redirect). The download is limited in size and time.
 */
export async function downloadPublicFile(
    address: string,
    options: DownloadOptions
): Promise<DownloadedFile> {
    const deadline = Date.now() + (options.timeoutMs ?? 30_000);
    let url: URL;
    try {
        url = new URL(address.trim());
    } catch {
        throw new Error('The address is not valid');
    }
    for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
        const got = await getOnce(url, options.maxBytes, deadline);
        if (!('redirect' in got)) return got;
        url = new URL(got.redirect, url);
    }
    throw new Error('The address redirects too many times');
}
