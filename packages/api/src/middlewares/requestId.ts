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
