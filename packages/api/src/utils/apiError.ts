import type { Request, Response } from 'express';

export function getMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return 'Request failed';
}

/**
 * Extracts the machine-readable parts of a client error for the response body: a `code`, the `missing`
 * required fields (ENTRY_INCOMPLETE), the `issues` with form answers (ANSWERS_INVALID), the `limit` and
 * its `max` (plan_limit), and `retryAfter`, the whole number of seconds to wait (also sent as the
 * `Retry-After` header).
 */
export function errorFields(err: unknown): {
    code?: string;
    missing?: string[];
    issues?: unknown[];
    limit?: string;
    max?: number;
    retryAfter?: number;
} {
    if (typeof err !== 'object' || err === null) return {};
    const { code, missing, issues, limit, max, retryAfter } = err as Record<string, unknown>;
    return {
        ...(typeof code === 'string' && { code }),
        ...(Array.isArray(missing) && { missing: missing.map(String) }),
        ...(Array.isArray(issues) && { issues }),
        ...(typeof limit === 'string' && { limit }),
        ...(typeof max === 'number' && { max }),
        ...(typeof retryAfter === 'number' &&
            Number.isInteger(retryAfter) &&
            retryAfter > 0 && { retryAfter })
    };
}

/**
 * Maps thrown errors to HTTP statuses. Core throws plain Error messages, and this keeps the routes consistent.
 */
export function getHttpStatusForError(err: unknown): number {
    if (typeof err === 'object' && err !== null) {
        const o = err as Record<string, unknown>;
        const sc = o.statusCode ?? o.status;
        if (typeof sc === 'number' && sc >= 400 && sc < 600) return sc;
    }
    const msg = getMessage(err).toLowerCase();

    if (msg.includes('not found')) return 404;
    if (msg.includes('invalid blueprint')) return 400;
    if (msg.includes('already exists')) return 409;
    if (msg.includes('cannot delete') && msg.includes('children')) return 409;
    if (msg.includes('circular')) return 400;
    if (msg.includes('forbidden') || msg.includes('access to this project')) return 403;
    if (msg.includes('operator access required')) return 403;
    if (msg.includes('publishing requires') || msg.includes('approved review')) return 403;
    if (msg.includes('invalid credentials')) return 401;
    if (msg.includes('invalid or expired token')) return 401;
    if (msg.includes('no token')) return 401;
    if (msg.includes('unauthorized')) return 401;
    if (msg.includes('invalid') && msg.includes('token')) return 401;
    if (msg.includes('invalid entry id') || msg.includes('invalid page id')) return 400;
    if (msg.includes('invalid project')) return 400;
    if (msg.includes('required')) return 400;
    if (msg.includes('validation failed')) return 400;

    return 500;
}

export type SendApiErrorOptions = {
    /** The message to log when the inferred status is 5xx. Defaults to the full error. */
    logContext?: string;
};

/**
 * Whether responses may include internal details of a server error (a 5xx's message and the stack).
 * This is true only in development (`NODE_ENV=development` or `test`). A server that never sets
 * NODE_ENV, as a self-hosted one may not, returns only "Internal server error".
 */
export const developing = () =>
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

/**
 * Sends a JSON error body and logs the error on the server. For a 5xx, the client receives a generic
 * message unless the server is in development mode (see `developing`).
 */
export function sendApiError(
    res: Response,
    req: Request,
    err: unknown,
    options?: SendApiErrorOptions
): void {
    const status = getHttpStatusForError(err);
    const requestId = req.requestId;
    const rawMessage = getMessage(err);

    const logPayload = {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        status,
        message: rawMessage,
        ...(options?.logContext ? { context: options.logContext } : {})
    };
    if (status >= 500) {
        console.error('[API]', logPayload, err);
        res.locals.errorLogged = true;
    }

    const exposeDetails = developing();
    const clientMessage = status >= 500 && !exposeDetails ? 'Internal server error' : rawMessage;

    const body: Record<string, unknown> = {
        error: clientMessage,
        requestId
    };
    if (status < 500) {
        const fields = errorFields(err);
        Object.assign(body, fields);
        if (fields.retryAfter) res.setHeader('Retry-After', String(fields.retryAfter));
    }
    if (exposeDetails && err instanceof Error && err.stack) {
        body.details = err.stack;
    }
    res.status(status).json(body);
}
