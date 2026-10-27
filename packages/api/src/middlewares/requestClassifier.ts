import { Request, Response, NextFunction } from 'express';

export type ApiRequestType = 'studio' | 'public' | null;

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

    // Studio-global routes (usage, seed, asset migration)
    if (path.includes('/studio/')) {
        req.apiRequestType = 'studio';
        next();
        return;
    }

    // Public API: what sites call. Channel reads and page outputs (API key or JWT), plus form
    // submissions, the one key-less endpoint.
    const projectsMatch =
        path.match(
            /\/projects\/([^/]+)\/(?:channels|sitemap\.xml|sitemap\.json|navigation|urls|breadcrumb|resolve)(?:\/|$)/
        ) ??
        // Reading the redirects is what a site does; changing them is the Studio's work.
        (req.method === 'GET' ? path.match(/\/projects\/([^/]+)\/redirects\/?$/) : null) ??
        path.match(/\/projects\/([^/]+)\/forms\/[^/]+\/submit\/?$/);
    if (projectsMatch) {
        const projectId = projectsMatch[1];
        req.apiRequestType = 'public';
        req.apiRequestProjectId = projectId;
    }

    next();
}
