import type { User } from '@moteurio/types/User.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { ApiKeyAccessPolicy } from '@moteurio/core/projectApiKey.js';

declare global {
    namespace Express {
        interface Request {
            /** Correlation id (generated or from `x-request-id`). */
            requestId?: string;
            /** Set by the JWT auth middleware when the token is valid. After project access it carries the user's roles in that project. */
            user?: User;
            /** The account as stored, with its account-level roles. Set by the project access middleware. */
            account?: User;
            /** Set by requireOperator to the signed-in operator. */
            operator?: import('@moteurio/core/operators.js').Operator;
            /** The project. Set by the project access middleware. */
            project?: ProjectSchema;
            /** Set when a valid project API key was presented. */
            apiKeyAuth?: boolean;
            /** Matched key id when apiKeyAuth is true. */
            apiKeyId?: string;
            /** Access policy for channel / site-wide public routes when using an API key. */
            apiKeyPolicy?: ApiKeyAccessPolicy;
            /** Valid preview token presented (`x-preview-token` or `?preview=` on GET). */
            previewAuth?: boolean;
            previewTokenId?: string;
            previewChannelId?: string;
            previewModelId?: string;
            previewEntryId?: string;
            previewPageId?: string;
            /** Set by the request classification middleware, for usage logging and rate limiting. */
            apiRequestType?: 'studio' | 'public' | 'image' | null;
            /** The project id that the request classification middleware infers for public routes. */
            apiRequestProjectId?: string;
            /** Raw JSON body string for webhook signature verification. */
            rawBody?: string;
        }
    }
}

export {};
