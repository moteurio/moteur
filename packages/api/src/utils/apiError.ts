import type { Request, Response } from 'express';

export function getMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return 'Request failed';
}

/**
 * Map thrown errors to HTTP status. Core uses plain Error messages; this keeps routes consistent.
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
    /** When the inferred status is 5xx, still log this message (defaults to full error). */
    logContext?: string;
};

/**
 * Send a JSON error body and log server-side. For 5xx in production, the client sees a generic message.
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
    }

    const exposeDetails = process.env.NODE_ENV !== 'production';
    const clientMessage = status >= 500 && !exposeDetails ? 'Internal server error' : rawMessage;

    const body: Record<string, unknown> = {
        error: clientMessage,
        requestId
    };
    if (exposeDetails && err instanceof Error && err.stack) {
        body.details = err.stack;
    }
    res.status(status).json(body);
}
