import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

const STUDIO_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const PUBLIC_WINDOW_MS = 15 * 60 * 1000;

function getStudioMax(): number {
    const v = (process.env.API_RATE_LIMIT_STUDIO_MAX ?? '').trim();
    if (v === '' || v === '0') return 10000; // effectively no limit
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 10000;
}

function getPublicMax(): number {
    const v = (process.env.API_RATE_LIMIT_PUBLIC_MAX ?? '').trim();
    if (v === '' || v === '0') return 1000; // default per project per window
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 1000;
}

function getFormsSubmitMax(): number {
    const v = (process.env.API_RATE_LIMIT_FORMS_MAX ?? '').trim();
    if (v === '' || v === '0') return 60;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 60;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getLoginMax(): number {
    const v = (process.env.API_RATE_LIMIT_LOGIN_MAX ?? '').trim();
    if (v === '' || v === '0') return 10;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
}

/**
 * Rate limiter for POST /auth/login to mitigate brute force.
 * Key: IP. Default: 10 attempts per 15 min. Env: API_RATE_LIMIT_LOGIN_MAX.
 */
export const loginRateLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: getLoginMax(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.ip || 'unknown') as string,
    message: { error: 'Too many login attempts. Please try again later.' }
});

/**
 * Rate limiter for `/studio/*` routes (usage, seed, asset migration).
 * Key: IP. Default: high limit; set API_RATE_LIMIT_STUDIO_MAX to enforce.
 */
export const studioRateLimiter = rateLimit({
    windowMs: STUDIO_WINDOW_MS,
    max: getStudioMax(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.ip || 'unknown') as string,
    message: { error: 'Too many requests; try again later.' }
});

/**
 * Rate limiter for public API (collections, pages, templates).
 * Key: projectId so limits are per project. Set API_RATE_LIMIT_PUBLIC_MAX to limit (default 1000/15min).
 */
export const publicRateLimiter = rateLimit({
    windowMs: PUBLIC_WINDOW_MS,
    max: getPublicMax(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const projectId = req.apiRequestProjectId;
        return projectId ? `public:${projectId}` : req.ip || 'unknown';
    },
    message: { error: 'Too many requests for this project; try again later.' }
});

/**
 * Runs the public rate limiter only when the request was classified as public.
 * Must be used after requestClassifier.
 */
export function publicRateLimitGate(req: Request, res: Response, next: NextFunction): void {
    if (req.apiRequestType !== 'public') {
        next();
        return;
    }
    publicRateLimiter(req, res, next);
}

const FORMS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Rate limiter for form submissions. Key: projectId + formId (per form, not per IP).
 * Default: 60 submissions per 15 min per form. Env: API_RATE_LIMIT_FORMS_MAX.
 * Apply only to POST /projects/:projectId/forms/:formId/submit.
 */
export const formsSubmitRateLimiter = rateLimit({
    windowMs: FORMS_WINDOW_MS,
    max: getFormsSubmitMax(),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const p = req.params;
        const projectId = p?.projectId ?? '';
        const formId = p?.formId ?? '';
        return `forms:${projectId}:${formId}`;
    },
    message: { error: 'Too many submissions. Please try again later.' }
});
