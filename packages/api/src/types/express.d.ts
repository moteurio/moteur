import type { User } from '@moteurio/types/User.js';

declare global {
    namespace Express {
        interface Request {
            /** Correlation id (generated or from `x-request-id`). */
            requestId?: string;
            /** Set by JWT auth middleware when valid. */
            user?: User;
            /** Set when a valid project API key was presented. */
            apiKeyAuth?: boolean;
            /** Set by request classification middleware for usage/rate-limit logic. */
            apiRequestType?: 'studio' | 'public' | null;
            /** Project id inferred by request classification middleware for public routes. */
            apiRequestProjectId?: string;
            /** Raw JSON body string for webhook signature verification. */
            rawBody?: string;
        }
    }
}

export {};
