/**
 * Package entry: `createMoteurAdminClient` (JWT / full API) and `createMoteurPublicClient` (API key, read-only).
 * Layout: see ../ARCHITECTURE.md
 */
export type {
    MoteurClientConfig,
    MoteurAuth,
    MoteurPublicClientConfig,
    MoteurPublicAuth,
    LoginResult,
    ApiError
} from './types.js';
export { DEFAULT_REQUEST_TIMEOUT_MS } from './types.js';
export type { MoteurClient } from './client.js';
export type { ProjectClient } from './admin/forProject.js';
export type { MoteurAdminClient } from './admin/adminClient.js';
export type { GenerateEntryParams, GenerateEntryResult, AiProjectOverview } from './admin/ai.js';
export type { MoteurPublicClient } from './public/createPublicClient.js';

export { createMoteurAdminClient } from './admin/adminClient.js';
export { createMoteurPublicClient } from './public/createPublicClient.js';
export { createProjectClient } from './admin/forProject.js';
export {
    resolveCredentials,
    readConfigFile,
    getConfigPath,
    MoteurClientError
} from './credentials.js';
export type { MoteurCredentials } from './credentials.js';

export type {
    ProjectSchema,
    ModelSchema,
    Entry,
    User,
    Comment,
    ActivityLogPage,
    ActivityEvent,
    RadarReport
} from '@moteurio/types';

export { createMoteurClientInternal, createRequestClient, MoteurApiError } from './client.js';
