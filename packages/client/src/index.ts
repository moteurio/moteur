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
export type {
    GenerateEntryParams,
    GenerateEntryResult,
    AiProjectOverview,
    AiHelpers,
    AiHelperName,
    AiHelperState,
    AiTextResult,
    AiAudioResult,
    AiModel3dResult,
    WritingAction
} from './admin/ai.js';
export type { MoteurPublicClient } from './public/createPublicClient.js';
export type { EntryListParams, EntryListResult, FieldLocales } from './project/entries.js';
export { entryListQuery } from './project/entries.js';
export type { AssetPage, AssetUsage } from './project/assets.js';
export type {
    MediaSettings,
    MediaSettingsUpdate,
    StorageSettings
} from './project/mediaSettings.js';
export type { PageMove } from './project/pages.js';
export type { SubmissionListParams, SubmissionListResult } from './project/submissions.js';

export {
    IMAGE_WIDTHS,
    IMAGE_RATIOS,
    imageUrl,
    imageSrcset,
    imageAttributes,
    focalPosition
} from './images.js';
export type {
    ImageRatio,
    ImageFormat,
    ImageAsset,
    ResolvedImage,
    ImageSource,
    ImageOptions,
    ImageAttributes
} from './images.js';

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
export type {
    ProjectApiKeyMeta,
    ProjectApiKeyCreateBody,
    ProjectApiKeyPatchBody,
    ProjectApiKeyCreateResponse
} from './project/apiKeys.js';
