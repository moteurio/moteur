import helmet from 'helmet';
import { RequestHandler } from 'express';

/**
 * Security headers via Helmet.
 * Disabled in development if HELMET_DISABLED=1 for easier local debugging (e.g. Swagger).
 */
export const securityHeaders: RequestHandler = (req, res, next) => {
    if (process.env.HELMET_DISABLED === '1') {
        next();
        return;
    }
    helmet({
        contentSecurityPolicy: process.env.HELMET_CSP_DISABLED === '1' ? false : undefined
    })(req, res, next);
};
