import type { Request, Response, NextFunction } from 'express';
import { getHttpStatusForError, getMessage } from '../utils/apiError.js';

/**
 * Express error middleware: consistent JSON, production-safe messages, always logs 5xx.
 */
export function globalErrorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    if (res.headersSent) {
        console.error('[API] Error after headers sent', { requestId: req.requestId, err });
        return;
    }

    const status = getHttpStatusForError(err);
    const requestId = req.requestId;
    const rawMessage = getMessage(err);

    const logPayload = {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        status,
        message: rawMessage
    };

    if (status >= 500) {
        console.error('[API unhandled]', logPayload, err);
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
