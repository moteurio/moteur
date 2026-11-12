import { Request, Response, NextFunction } from 'express';
import { hasRole, inProject, isInProject } from '@moteurio/types';
import { actingUser, verifyJWT } from '@moteurio/core/auth.js';
import { getUserById } from '@moteurio/core/users.js';
import { verifyOperatorToken } from '@moteurio/core/operators.js';
import { systemActor } from '@moteurio/core/utils/systemActor.js';
import { getProject } from '@moteurio/core/projects.js';
import { workspaceOf } from '@moteurio/core/workspaces.js';
import { verifyProjectApiKey } from '@moteurio/core/projectApiKey.js';
import { noteApiKeyUse } from '@moteurio/core/apiKeyUsage.js';
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
        req.user = actingUser(user, payload);
        next();
    } catch (err) {
        console.warn('[auth] JWT verification failed:', err instanceof Error ? err.message : err);
        return void res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Requires an operator, who runs the whole server and signs in on /operator/auth with an
 * authenticator (see @moteurio/core/operators). Only an operator token passes; a user token is
 * always refused, whatever the user's roles. The request then runs as the engine itself
 * (`req.user` is a system actor named after the operator), so it can reach every project, and
 * `req.operator` identifies the operator.
 */
export function requireOperator(req: Request, res: Response, next: NextFunction) {
    const token = readBearerToken(req.headers.authorization);
    try {
        if (!token) throw new Error('No token');
        const operator = verifyOperatorToken(token);
        req.operator = operator;
        req.user = systemActor(`operator:${operator.id}`, `${operator.name} (operator)`);
        next();
    } catch {
        res.status(401).json({ error: 'Operator sign-in required', code: 'operator_auth' });
    }
}

/** Accepts a signed-in user or an operator. Used for the few reads both need, such as the blueprint catalogue. */
export function requireAuthOrOperator(req: Request, res: Response, next: NextFunction) {
    const token = readBearerToken(req.headers.authorization);
    if (token) {
        try {
            req.operator = verifyOperatorToken(token);
            req.user = systemActor(
                `operator:${req.operator.id}`,
                `${req.operator.name} (operator)`
            );
            return void next();
        } catch {
            // The token is not an operator token, so try it as a user token.
        }
    }
    requireAuth(req, res, next);
}

/** Requires a project member with the Developer role. The Admin role is not enough. */
export function requireDeveloper(req: Request, res: Response, next: NextFunction) {
    requireProjectAccess(req, res, () => {
        if (!hasRole(req.user, 'developer')) {
            return void res.status(403).json({ error: 'Developer access required' });
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
            if (!hasRole(user, requiredRole)) {
                return void res.status(403).json({ error: 'Forbidden' });
            }
            next();
        });
    };
}

/** Sets `req.user` if a valid JWT is present. Continues without a user when the token is missing or invalid. */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const token = readBearerToken(req.headers.authorization);
    if (!token) return next();
    try {
        const payload = verifyJWT(token);
        const user = getUserById(payload.sub as string);
        if (user?.id && user.isActive) req.user = actingUser(user, payload);
    } catch {
        // Authentication is optional, so an invalid token is ignored.
    }
    next();
}

/**
 * Requires a project member. Afterwards `req.user` carries the member's roles in this project
 * (see `ProjectSchema.memberRoles`), `req.account` holds the account as stored, and `req.project`
 * holds the project.
 */
export function requireProjectAccess(req: Request, res: Response, next: NextFunction) {
    requireAuth(req, res, async () => {
        const user = req.user;
        if (!user) {
            return void res.status(401).json({ error: 'Unauthorized' });
        }
        const projectId = (req.params as Record<string, string>).projectId || req.body?.projectId;

        if (!projectId) {
            return void res.status(400).json({ error: 'Project ID is required' });
        }

        let project;
        try {
            project = await getProject(user, projectId);
        } catch {
            return void res.status(403).json({ error: 'Access to this project is forbidden' });
        }
        const workspace = workspaceOf(project);
        if (!isInProject(user.id, project, workspace)) {
            return void res.status(403).json({ error: 'Access to this project is forbidden' });
        }
        req.account = user;
        req.project = project;
        req.user = inProject(user, project, workspace);
        next();
    });
}

/** Requires a project member with the Builder role (models, blocks, templates, layouts, structures, forms). */
export function requireBuilder(req: Request, res: Response, next: NextFunction) {
    requireProjectAccess(req, res, () => {
        if (!hasRole(req.user, 'builder')) {
            return void res.status(403).json({ error: 'Builder access required' });
        }
        next();
    });
}

/** Requires a project member with the Content lead role. Admins qualify too. */
export function requireContentLead(req: Request, res: Response, next: NextFunction) {
    requireProjectAccess(req, res, () => {
        if (!hasRole(req.user, 'lead')) {
            return void res.status(403).json({ error: 'Content lead access required' });
        }
        next();
    });
}

/** Requires a project member with the Admin role in that project. */
export function requireProjectAdmin(req: Request, res: Response, next: NextFunction) {
    requireProjectAccess(req, res, () => {
        if (!hasRole(req.user, 'admin')) {
            return void res.status(403).json({ error: 'Project admin access required' });
        }
        next();
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
 * Recognizes a project API key from the `x-api-key` header only, because keys in query strings leak through logs and referrers.
 * If a key is present, verifies it against the projectId from `req.params.projectId`. On success sets
 * `req.apiKeyAuth`, `req.apiKeyId`, and `req.apiKeyPolicy` (channel allowlist + site-wide flag), runs
 * allowed-host checks when configured, and otherwise responds 401 or 403. If there is no header, calls next() so a later handler may require a JWT.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const rawKey = (req.headers['x-api-key'] as string)?.trim() ?? '';
    if (!rawKey) {
        next();
        return;
    }

    const projectId = (req.params as Record<string, string>).projectId;
    if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
    }
    verifyProjectApiKey(projectId, rawKey)
        .then(result => {
            if (!result.ok) {
                res.status(401).json(
                    result.reason === 'expired'
                        ? { error: 'API key expired', code: 'API_KEY_EXPIRED' }
                        : { error: 'Invalid API key' }
                );
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
            noteApiKeyUse(projectId, result.keyId);
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
export function requireChannelOrProjectAccess(
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
 * When the request uses an API key scoped to specific channels and site-wide reads are off,
 * respond with 403. JWT requests are never blocked here.
 */
export function denyIfApiKeySiteWideBlocked(req: Request, res: Response): boolean {
    if (req.user) return false;
    if (!req.apiKeyAuth) return false;
    const p = req.apiKeyPolicy;
    if (!p || p.channelAllowlist === null) return false;
    if (p.allowSiteWideReads) return false;
    res.status(403).json({
        error: 'This API key cannot access site-wide endpoints (sitemap, navigation, urls, breadcrumb, resolve, redirects)',
        code: 'API_KEY_SITE_READ_NOT_ALLOWED'
    });
    return true;
}

/**
 * Requires either a JWT (`req.user`) or an API key (`req.apiKeyAuth`).
 * An API key alone is read-only, so any method other than GET is refused with 403.
 */
export function requireChannelAuth(req: Request, res: Response, next: NextFunction): void {
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
