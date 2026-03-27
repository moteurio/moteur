import { Request, Response, NextFunction } from 'express';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';
import { verifyJWT } from '@moteurio/core/auth.js';
import { getUserById } from '@moteurio/core/users.js';
import { getProject } from '@moteurio/core/projects.js';
import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { requestHostMatchesAllowed } from '@moteurio/core/apiKeyAllowedHosts.js';

function readBearerToken(header: string | undefined): string | undefined {
    if (typeof header !== 'string') return undefined;
    const m = /^Bearer\s+(\S+)/i.exec(header.trim());
    return m?.[1];
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = readBearerToken(req.headers.authorization);

    if (!token) {
        return void res.status(401).json({ error: 'No token provided' });
    }

    try {
        const payload = verifyJWT(token);
        const user = getUserById(payload.sub as string);
        if (!user || !user.id || !user.isActive) {
            return void res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    } catch (err) {
        console.warn('[auth] JWT verification failed:', err instanceof Error ? err.message : err);
        return void res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export function requireOperator(req: Request, res: Response, next: NextFunction) {
    requireAuth(req, res, () => {
        const user = req.user;
        if (!user?.roles?.includes(OPERATOR_ROLE_SLUG)) {
            return void res.status(403).json({ error: 'Operator access required' });
        }
        next();
    });
}

export function requireRole(requiredRole: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        requireAuth(req, res, () => {
            const user = req.user;
            if (!user) {
                return void res.status(401).json({ error: 'Unauthorized' });
            }
            if (!user.roles.includes(requiredRole)) {
                return void res.status(403).json({ error: 'Forbidden' });
            }
            next();
        });
    };
}

/** Sets req.user if valid JWT present; does not fail if no token or invalid. */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const token = readBearerToken(req.headers.authorization);
    if (!token) return next();
    try {
        const payload = verifyJWT(token);
        const user = getUserById(payload.sub as string);
        if (user?.id && user.isActive) req.user = user;
    } catch {
        // ignore invalid token for optional auth
    }
    next();
}

export function requireProjectAccess(req: Request, res: Response, next: NextFunction) {
    requireAuth(req, res, async () => {
        const user = req.user;
        if (!user) {
            return void res.status(401).json({ error: 'Unauthorized' });
        }
        const projectId = req.params.projectId || req.body.projectId;

        if (!projectId) {
            return void res.status(400).json({ error: 'Project ID is required' });
        }

        try {
            const project = await getProject(user, projectId);
            if (!project.users?.includes(user.id)) {
                return void res.status(403).json({ error: 'Access to this project is forbidden' });
            }
            next();
        } catch {
            return void res.status(403).json({ error: 'Access to this project is forbidden' });
        }
    });
}

/**
 * Optional auth, then if req.user is set enforces project access (same as requireProjectAccess).
 * Use for routes that support both public (unauthenticated or API key) and authenticated (JWT) access.
 */
export function optionalProjectAccess(req: Request, res: Response, next: NextFunction) {
    optionalAuth(req, res, () => {
        if (!req.user) return next();
        requireProjectAccess(req, res, next);
    });
}

/**
 * Recognizes project API key from header `x-api-key` only (query string keys leak via logs/referrers).
 * If a key is present: verifies against projectId (from req.params.projectId). On success sets
 * `req.apiKeyAuth`, `req.apiKeyId`, and `req.apiKeyPolicy` (collection allowlist + site-wide flag), runs
 * allowed-host checks when configured, else 401/403. If no header: next() (caller may require JWT).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const rawKey = (req.headers['x-api-key'] as string)?.trim() ?? '';
    if (!rawKey) {
        next();
        return;
    }

    const projectId = req.params.projectId;
    if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
    }
    verifyProjectApiKey(projectId, rawKey)
        .then(result => {
            if (!result.ok) {
                res.status(401).json({ error: 'Invalid API key' });
                return;
            }
            const patterns = result.allowedHosts;
            if (patterns?.length) {
                const hostCheck = requestHostMatchesAllowed(
                    { origin: req.headers.origin, referer: req.headers.referer },
                    patterns
                );
                if (!hostCheck.ok) {
                    res.status(403).json({
                        error: 'API key is restricted to allowed hosts; send a valid Origin or Referer header',
                        code: 'API_KEY_HOST_NOT_ALLOWED'
                    });
                    return;
                }
            }
            req.apiKeyAuth = true;
            req.apiKeyId = result.keyId;
            req.apiKeyPolicy = result.policy;
            next();
        })
        .catch(() => {
            res.status(401).json({ error: 'Invalid API key' });
        });
}

/**
 * For routes that support both JWT (project access) and API key (channel/read).
 * Runs optionalAuth, then: if req.user run requireProjectAccess; else if req.apiKeyAuth next(); else 401.
 */
export function requireCollectionOrProjectAccess(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    optionalAuth(req, res, () => {
        if (req.user) return requireProjectAccess(req, res, next);
        if (req.apiKeyAuth === true) return next();
        res.status(401).json({ error: 'API key or JWT required' });
    });
}

/**
 * When the request uses an API key scoped to specific collections and site-wide reads are off,
 * respond with 403. JWT requests are never blocked here.
 */
export function denyIfApiKeySiteWideBlocked(req: Request, res: Response): boolean {
    if (req.user) return false;
    if (!req.apiKeyAuth) return false;
    const p = req.apiKeyPolicy;
    if (!p || p.collectionWhitelist === null) return false;
    if (p.allowSiteWideReads) return false;
    res.status(403).json({
        error: 'This API key cannot access site-wide endpoints (sitemap, navigation, urls, breadcrumb, radar)',
        code: 'API_KEY_SITE_READ_NOT_ALLOWED'
    });
    return true;
}

/**
 * Requires either JWT (req.user) or API key (req.apiKeyAuth).
 * If only API key and method is not GET, returns 403 (read-only).
 */
export function requireCollectionAuth(req: Request, res: Response, next: NextFunction): void {
    const hasUser = !!req.user;
    const hasApiKey = req.apiKeyAuth === true;
    if (!hasUser && !hasApiKey) {
        res.status(401).json({ error: 'Authentication required (API key or JWT)' });
        return;
    }
    if (!hasUser && hasApiKey && req.method !== 'GET') {
        res.status(403).json({ error: 'API key is read-only; use JWT for write operations' });
        return;
    }
    next();
}
