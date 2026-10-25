import type { User } from '@moteurio/types/User.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { ApiKeyAccessPolicy } from '@moteurio/core/projectApiKey.js';

declare global {
    namespace Express {
        interface Request {
            /** Correlation id (generated or from `x-request-id`). */
            requestId?: string;
            /** Set by JWT auth middleware when valid. After project access: roles in that project. */
            user?: User;
            /** The account as stored (account roles), set by project access middleware. */
            account?: User;
            /** Set by requireOperator: the operator signed in. */
            operator?: import('@moteurio/core/operators.js').Operator;
            /** The project, set by project access middleware. */
            project?: ProjectSchema;
            /** Set when a valid project API key was presented. */
            apiKeyAuth?: boolean;
            /** Matched key id when apiKeyAuth is true. */
            apiKeyId?: string;
            /** Access policy for collection / site-wide public routes when using an API key. */
            apiKeyPolicy?: ApiKeyAccessPolicy;
            /** Valid preview token presented (`x-preview-token` or `?preview=` on GET). */
            previewAuth?: boolean;
            previewTokenId?: string;
            previewCollectionId?: string;
            previewEntryId?: string;
            previewPageId?: string;
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
