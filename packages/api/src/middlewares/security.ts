import helmet from 'helmet';
import { RequestHandler } from 'express';

/**
 * Security headers via Helmet.
 * HELMET_DISABLED=1 skips Helmet only when NODE_ENV is not `production` (local docs / debugging).
 */
export const securityHeaders: RequestHandler = (req, res, next) => {
    if (process.env.HELMET_DISABLED === '1' && process.env.NODE_ENV !== 'production') {
        next();
        return;
    }
    helmet({
        contentSecurityPolicy: process.env.HELMET_CSP_DISABLED === '1' ? false : undefined
    })(req, res, next);
};
