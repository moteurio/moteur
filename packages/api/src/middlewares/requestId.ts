import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Attaches req.requestId for tracing (response JSON errors and logs).
 * Honors incoming `x-request-id` when present.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const id =
        typeof incoming === 'string' && incoming.trim().length > 0
            ? incoming.trim().slice(0, 128)
            : randomUUID();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
}

/**
 * A server error no route logged (some answer 500 by hand): logged here, with the request, so no
 * failure goes unseen in the server's log.
 */
export function logUnloggedErrors(req: Request, res: Response, next: NextFunction): void {
    res.on('finish', () => {
        if (res.statusCode >= 500 && !res.locals.errorLogged)
            console.error('[API] server error', {
                requestId: req.requestId,
                method: req.method,
                path: req.originalUrl ?? req.url,
                status: res.statusCode
            });
    });
    next();
}
