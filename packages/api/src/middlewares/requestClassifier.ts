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

    // Public API: project-scoped read endpoints accessible via API key or JWT.
    // Includes collections, pages, templates, forms, and page outputs (sitemap, navigation, urls, breadcrumb).
    const projectsMatch = path.match(
        /\/projects\/([^/]+)(?:\/(collections|pages|templates|forms|sitemap\.xml|sitemap\.json|navigation|urls|breadcrumb))(?:\/|$)/
    );
    if (projectsMatch) {
        const projectId = projectsMatch[1];
        // Count as public: collections (API key), pages, templates (public read)
        req.apiRequestType = 'public';
        req.apiRequestProjectId = projectId;
    }

    next();
}
