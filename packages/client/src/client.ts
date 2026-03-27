import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { MoteurAuth, MoteurClientConfig } from './types.js';
import { DEFAULT_REQUEST_TIMEOUT_MS } from './types.js';

function trimSlash(s: string): string {
    return s.replace(/\/+$/, '');
}

function requestUrlHint(err: { config?: { baseURL?: string; url?: string } }): string {
    const b = err.config?.baseURL?.replace(/\/+$/, '') ?? '';
    const u = err.config?.url?.replace(/^\//, '') ?? '';
    if (!b && !u) return '';
    const joined = u ? `${b}/${u}` : b;
    return joined ? `Request: ${joined}` : '';
}

/** Build a readable message from an axios error (JSON `{ error }`, HTML/text bodies, network failures). */
function messageFromAxiosError(err: unknown): string {
    if (!axios.isAxiosError(err)) {
        if (err instanceof Error && err.message.trim()) return err.message;
        return String(err);
    }

    const res = err.response;
    const status = res?.status;
    const statusText = (res?.statusText ?? '').trim();
    const httpLine = status != null ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}` : '';
    const d = res?.data;

    if (typeof d === 'string') {
        const t = d.trim().slice(0, 280);
        const snippet = t.length > 0 ? t : 'Non-JSON error body';
        return httpLine ? `${snippet} (${httpLine})` : snippet;
    }
    if (d && typeof d === 'object') {
        const o = d as Record<string, unknown>;
        const raw = o.error ?? o.message;
        let detail: string;
        if (typeof raw === 'string' && raw.trim()) detail = raw.trim();
        else if (raw != null) detail = JSON.stringify(raw);
        else detail = JSON.stringify(d);
        const withDetails =
            typeof o.details === 'string' && o.details.trim()
                ? `${detail}: ${o.details.trim()}`
                : detail;
        return httpLine ? `${withDetails} (${httpLine})` : withDetails;
    }

    // Response with no body / unparsed body — still report status (common with wrong base path or proxies).
    if (res && httpLine) {
        const axiosMsg = err.message?.trim();
        const extra =
            axiosMsg && axiosMsg !== 'Request failed' && !axiosMsg.includes(String(status))
                ? ` — ${axiosMsg}`
                : '';
        return `Empty or unreadable response body (${httpLine})${extra}`;
    }

    // No HTTP response: refused connection, DNS, timeout, etc.
    const code = err.code ? `${err.code}` : '';
    const axiosMsg = err.message?.trim() || 'Network request failed';
    const urlHint = requestUrlHint(err);
    const parts = [code ? `${axiosMsg} (${code})` : axiosMsg];
    if (urlHint) parts.push(urlHint);
    parts.push(
        'No response from server — is the API running? Check MOTEUR_API_URL (and include your API_BASE_PATH, e.g. …/api).'
    );
    return parts.join('. ');
}

/** Thrown when the API returns a non-2xx response (after axios). Check `status` and `response`. */
export class MoteurApiError extends Error {
    readonly status?: number;
    readonly response?: unknown;

    constructor(message: string, options?: { status?: number; response?: unknown }) {
        super(message);
        this.name = 'MoteurApiError';
        this.status = options?.status;
        this.response = options?.response;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export function createRequestClient(config: MoteurClientConfig): AxiosInstance {
    const baseURL = trimSlash(config.baseURL);
    const timeout = config.timeout === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : config.timeout;

    const instance = axios.create({
        baseURL,
        timeout: timeout === 0 ? undefined : timeout,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: status => status >= 200 && status < 300
    });

    instance.interceptors.request.use(req => {
        const auth = (config as { auth?: MoteurAuth }).auth;
        if (!auth) return req;
        if (auth.type === 'bearer') {
            req.headers.Authorization = `Bearer ${auth.token}`;
        } else if (auth.type === 'apiKey') {
            req.headers['x-api-key'] = auth.apiKey;
        }
        return req;
    });

    instance.interceptors.response.use(
        res => res,
        err => {
            const message = messageFromAxiosError(err);
            return Promise.reject(
                new MoteurApiError(message, {
                    status: err.response?.status,
                    response: err.response
                })
            );
        }
    );

    return instance;
}

export function createMoteurClientInternal(config: MoteurClientConfig) {
    const request = createRequestClient(config);
    const baseURL = trimSlash(config.baseURL);

    return {
        get baseURL() {
            return baseURL;
        },
        get auth(): MoteurAuth | undefined {
            return config.auth;
        },
        setAuth(auth: MoteurAuth | undefined) {
            (config as { auth?: MoteurAuth }).auth = auth;
        },
        request<T = unknown>(options: AxiosRequestConfig): Promise<T> {
            return request.request(options).then(r => r.data as T);
        },
        get<T = unknown>(
            url: string,
            params?: Record<string, string | number | boolean | undefined>
        ): Promise<T> {
            return request.get(url, { params }).then(r => r.data as T);
        },
        post<T = unknown>(url: string, data?: unknown): Promise<T> {
            return request.post(url, data).then(r => r.data as T);
        },
        put<T = unknown>(url: string, data?: unknown): Promise<T> {
            return request.put(url, data).then(r => r.data as T);
        },
        patch<T = unknown>(url: string, data?: unknown): Promise<T> {
            return request.patch(url, data).then(r => r.data as T);
        },
        delete<T = unknown>(url: string): Promise<T> {
            return request.delete(url).then(r => r.data as T);
        },
        /** Low-level axios instance (e.g. multipart upload). Not covered by semver as strictly as high-level methods. */
        _raw: request
    };
}

export type MoteurClient = ReturnType<typeof createMoteurClientInternal>;
