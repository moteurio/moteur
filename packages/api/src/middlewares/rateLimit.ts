import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { Request, Response } from 'express';

function ipKey(req: Request): string {
    return ipKeyGenerator(req.ip || 'unknown');
}

/**
 * The refusal when a limit is reached: `{ error, code: 'rate_limited', retryAfter }`, with
 * `retryAfter` the whole seconds until the window resets, as the `Retry-After` header says.
 */
export function limitReached(error: string): Pick<Options, 'handler'> {
    return {
        handler: (req: Request, res: Response, _next, options) => {
            const header = Number(res.getHeader('Retry-After'));
            const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit
                ?.resetTime;
            const retryAfter =
                Number.isFinite(header) && header > 0
                    ? Math.ceil(header)
                    : reset
                      ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
                      : Math.ceil(options.windowMs / 1000);
            if (!res.headersSent) res.setHeader('Retry-After', String(retryAfter));
            res.status(options.statusCode).json({ error, code: 'rate_limited', retryAfter });
        }
    };
}

const STUDIO_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getStudioMax(): number {
    const v = (process.env.API_RATE_LIMIT_STUDIO_MAX ?? '').trim();
    if (v === '' || v === '0') return 10000; // effectively no limit
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : 10000;
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
    keyGenerator: (req: Request) => ipKey(req),
    ...limitReached('Too many login attempts. Please try again later.')
});

/** Browser-bound provider proofs have their own budget, independent of password attempts. */
export const verificationRateLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: Math.max(1, Math.min(1000, Number(process.env.API_RATE_LIMIT_VERIFICATION_MAX) || 60)),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => ipKey(req),
    ...limitReached('Too many verification requests. Try again later.')
});

/**
 * Rate limiter for the Studio's routes (`/studio/*`, and what members do under `/projects`).
 * Key: IP. Default: high limit; set API_RATE_LIMIT_STUDIO_MAX to enforce. What sites ask for
 * (reads, images) is left out: one site server is one IP for every visitor, and fairShare
 * already keeps each project to its share.
 */
export const studioRateLimiter = rateLimit({
    windowMs: STUDIO_WINDOW_MS,
    max: getStudioMax(),
    skip: (req: Request) => req.apiRequestType === 'public' || req.apiRequestType === 'image',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => ipKey(req),
    ...limitReached('Too many requests; try again later.')
});

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
        const p = req.params as Record<string, string>;
        const projectId = p?.projectId ?? '';
        const formId = p?.formId ?? '';
        return `forms:${projectId}:${formId}`;
    },
    ...limitReached('Too many submissions. Please try again later.')
});

/**
 * Rate limiter for form tokens (asked for each time a site shows a form). Per form, four times
 * the submissions allowed: most visitors who see a form don't send it.
 */
export const formsTokenRateLimiter = rateLimit({
    windowMs: FORMS_WINDOW_MS,
    max: getFormsSubmitMax() * 4,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const p = req.params as Record<string, string>;
        return `forms-token:${p?.projectId ?? ''}:${p?.formId ?? ''}`;
    },
    ...limitReached('Too many requests. Please try again later.')
});
