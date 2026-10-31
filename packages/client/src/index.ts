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
    SignedIn,
    TwoFactorRequired,
    ApiError
} from './types.js';
export { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_API_URL } from './types.js';
export type { KeyInfo } from './types.js';
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
export type { BinItem, BinRestored } from './project/bin.js';
export type {
    MediaSettings,
    MediaSettingsUpdate,
    StorageSettings
} from './project/mediaSettings.js';
export type { ProjectEmail, ProjectEmailPreview, ProjectEmailUpdate } from './project/email.js';
export type { PageMove, PageReferrer } from './project/pages.js';
export type { RedirectInput } from './project/redirects.js';
export type { GitStatus, GitTokenInfo } from './admin/projects.js';
export type { AccountDeletion, AccountExport } from './admin/auth.js';
export type { ServerSettings } from './admin/operator.js';
export type {
    ResolvedPath,
    SiteUrl,
    NavigationNode,
    BreadcrumbItem
} from './public/pageOutputs.js';
export type {
    PublicChannel,
    ReadOptions,
    EntryReadOptions,
    EntryListOptions
} from './public/channel.js';
export type {
    PublicSchema,
    PublicModel,
    PublicTemplate,
    PublicBlock,
    PublicStructure,
    PublicField,
    Localizable
} from '@moteurio/types/PublicSchema.js';
export type {
    SchemaShape,
    ContentShape,
    LocaleMode,
    UntypedSchema,
    DeliveredEntry,
    DeliveredPage,
    ModelId,
    EntryOf,
    PageOf
} from './public/schema.js';
export type {
    PublicForm,
    FormSubmitOptions,
    FormSubmitResult,
    FormIssue,
    FormIssueCode
} from './public/forms.js';
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

export { richTextHtml } from './richText.js';
export type { DastDocument, DastNode, DastMark } from './richText.js';

export { createMoteurAdminClient } from './admin/adminClient.js';
export { createMoteurPublicClient } from './public/createPublicClient.js';
export { t, siblingPath, localeFromPathname } from './delivery/locale.js';
export {
    createBlockRegistry,
    type DeliveryBlock,
    type BlockRenderer,
    type BlockRegistryOptions
} from './delivery/blocks.js';
export {
    createPreviewSession,
    readPreviewTokenFromSource,
    type PreviewSessionSource
} from './delivery/preview.js';
export type {
    PreviewTokenCreateBody,
    PreviewTokenCreateResponse
} from './project/previewTokens.js';
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
