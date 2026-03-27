import type { User } from '@moteurio/types/User.js';
import type { ApiKeyAccessPolicy } from '@moteurio/core/projectApiKey.js';

declare global {
    namespace Express {
        interface Request {
            /** Correlation id (generated or from `x-request-id`). */
            requestId?: string;
            /** Set by JWT auth middleware when valid. */
            user?: User;
            /** Set when a valid project API key was presented. */
            apiKeyAuth?: boolean;
            /** Matched key id when apiKeyAuth is true. */
            apiKeyId?: string;
            /** Access policy for collection / site-wide public routes when using an API key. */
            apiKeyPolicy?: ApiKeyAccessPolicy;
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
