import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { validateUrl } from './networkPolicy.js';

/** Sends one POST to a validated, pinned IP address. Redirects are deliberately never followed. */
export function postWebhook(
    url: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
    maxBytes: number
): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        let request: ClientRequest | undefined;
        let response: IncomingMessage | undefined;
        let settled = false;
        const finish = (error?: Error, result?: { status: number; body: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(result!);
            response?.destroy();
            request?.destroy();
        };
        // The timeout covers DNS, the connection, the response headers and the entire size-limited response body.
        const timer = setTimeout(() => finish(new Error('Webhook request timed out')), timeoutMs);
        void (async () => {
            const target = await validateUrl(url);
            const targetUrl = new URL(url);
            if (settled) return;
            const safeHeaders = Object.fromEntries(
                Object.entries(headers).filter(
                    ([key]) =>
                        !['host', 'content-length', 'transfer-encoding', 'connection'].includes(
                            key.toLowerCase()
                        )
                )
            );
            request = (targetUrl.protocol === 'https:' ? httpsRequest : httpRequest)(
                targetUrl,
                {
                    method: 'POST',
                    headers: { ...safeHeaders, 'Content-Length': Buffer.byteLength(body) },
                    agent: false,
                    family: target.family,
                    // Keep the original hostname for the Host header and TLS verification, without a second DNS lookup.
                    lookup: (_hostname, _options, callback) =>
                        callback(null, target.address, target.family)
                },
                res => {
                    response = res;
                    const chunks: Buffer[] = [];
                    let size = 0;
                    const done = () =>
                        finish(undefined, {
                            status: res.statusCode ?? 0,
                            body: Buffer.concat(chunks).toString('utf8')
                        });
                    res.on('data', (chunk: Buffer) => {
                        const part = chunk.subarray(0, Math.max(0, maxBytes - size));
                        chunks.push(part);
                        size += part.length;
                        if (size >= maxBytes) done();
                    });
                    res.on('end', done);
                    res.on('error', finish);
                    res.on('aborted', () => finish(new Error('Webhook response aborted')));
                }
            );
            request.on('error', finish);
            request.end(body);
        })().catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    });
}
