import { Request, Response, NextFunction } from 'express';

export type ApiRequestType = 'studio' | 'public' | 'image' | null;

/**
 * Classifies the request for usage logging and rate limiting.
 * Sets:
 *   req.apiRequestType = 'studio' | 'public' | null
 *   req.apiRequestProjectId = string | undefined (for public, the projectId from path)
 */
export function requestClassifier(req: Request, res: Response, next: NextFunction): void {
    const path = (req.originalUrl || req.url || '').split('?')[0];
    req.apiRequestType = null;
    req.apiRequestProjectId = undefined;

    // Images that sites display (originals, resized copies and other files stored with them) count
    // as the project's image traffic. A malformed project id is left for the route to reject.
    const image =
        req.method === 'GET' || req.method === 'HEAD'
            ? path.match(/\/static\/(?:resize|assets)\/([^/]+)\//)
            : null;
    if (image) {
        try {
            req.apiRequestProjectId = decodeURIComponent(image[1]);
            req.apiRequestType = 'image';
        } catch {
            // The path segment is not a valid encoded project id.
        }
        next();
        return;
    }
    // Server-wide admin client routes (usage, seed, asset migration)
    if (path.includes('/studio/')) {
        req.apiRequestType = 'studio';
        next();
        return;
    }

    // Public API, called by sites: channel reads and page outputs (API key or JWT), form
    // submissions, and plugin endpoints for sites under /play/ (for example a poll's votes).
    const projectsMatch =
        path.match(
            /\/projects\/([^/]+)\/(?:channels|sitemap\.xml|sitemap\.json|navigation|urls|breadcrumb|resolve)(?:\/|$)/
        ) ??
        // Sites read redirects with GET. Changing redirects is an admin operation and is not public.
        (req.method === 'GET' ? path.match(/\/projects\/([^/]+)\/redirects\/?$/) : null) ??
        path.match(/\/projects\/([^/]+)\/forms\/[^/]+\/submit\/?$/) ??
        path.match(/\/projects\/([^/]+)\/play\//);
    if (projectsMatch) {
        const projectId = projectsMatch[1];
        req.apiRequestType = 'public';
        req.apiRequestProjectId = projectId;
    }

    next();
}
