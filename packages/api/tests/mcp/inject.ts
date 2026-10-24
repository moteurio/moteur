/** Exercise Express and its real HTTP parsers without binding a port (restricted CI/sandboxes). */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { URLSearchParams } from 'node:url';
import type { Express } from 'express';

type Result = { status: number; body: Record<string, any>; headers: Record<string, string> };

export default function request(app: Express) {
    const build = (method: string, path: string) => {
        const headers: Record<string, string> = { host: 'api.example.com' };
        let body: unknown;
        const query = new URLSearchParams();
        const chain = {
            set(values: Record<string, string>) {
                Object.assign(
                    headers,
                    Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
                );
                return chain;
            },
            auth(token: string, _options: { type: 'bearer' }) {
                headers.authorization = `Bearer ${token}`;
                return chain;
            },
            query(values: Record<string, string>) {
                for (const [key, value] of Object.entries(values)) query.set(key, value);
                return chain;
            },
            type(_type: 'form') {
                headers['content-type'] = 'application/x-www-form-urlencoded';
                return chain;
            },
            send(value: unknown) {
                body = value;
                return chain;
            },
            then<T = Result, E = never>(
                resolve?: ((result: Result) => T | PromiseLike<T>) | null,
                reject?: ((reason: unknown) => E | PromiseLike<E>) | null
            ): Promise<T | E> {
                return new Promise<Result>((done, fail) => {
                    const socket = new Socket();
                    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });
                    const req = new IncomingMessage(socket);
                    req.on('end', () => {
                        req.complete = true;
                    });
                    req.method = method;
                    req.url = path + (query.size ? `?${query}` : '');
                    let encoded = '';
                    if (body !== undefined) {
                        if (
                            headers['content-type']?.startsWith('application/x-www-form-urlencoded')
                        )
                            encoded = new URLSearchParams(
                                body as Record<string, string>
                            ).toString();
                        else {
                            headers['content-type'] = 'application/json';
                            encoded = JSON.stringify(body);
                        }
                    }
                    headers['content-length'] = String(Buffer.byteLength(encoded));
                    req.headers = headers;
                    const res = new ServerResponse(req);
                    const chunks: Buffer[] = [];
                    res.write = ((chunk: string | Uint8Array) => {
                        chunks.push(Buffer.from(chunk));
                        return true;
                    }) as typeof res.write;
                    res.end = ((chunk?: string | Uint8Array) => {
                        if (chunk) chunks.push(Buffer.from(chunk));
                        const text = Buffer.concat(chunks).toString();
                        const responseHeaders = Object.fromEntries(
                            Object.entries(res.getHeaders()).map(([k, v]) => [k, String(v)])
                        );
                        done({
                            status: res.statusCode,
                            headers: responseHeaders,
                            body:
                                responseHeaders['content-type']?.includes('json') && text
                                    ? JSON.parse(text)
                                    : {}
                        });
                        return res;
                    }) as typeof res.end;
                    app(req, res, (error: unknown) => {
                        fail(error ?? new Error(`Unhandled route: ${method} ${path}`));
                    });
                    if (encoded) req.push(encoded);
                    req.push(null);
                }).then(resolve, reject);
            }
        };
        return chain;
    };
    return {
        get: (path: string) => build('GET', path),
        post: (path: string) => build('POST', path),
        patch: (path: string) => build('PATCH', path),
        delete: (path: string) => build('DELETE', path)
    };
}
