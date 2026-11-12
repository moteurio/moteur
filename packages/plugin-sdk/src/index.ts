import type {
    AuthProviderContribution,
    PluginManifest,
    PluginRouteContext,
    PluginRouteContribution
} from '@moteurio/types/Plugin.js';
import type { VideoProvidersConfig } from '@moteurio/types/Project.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { BlueprintSchema } from '@moteurio/types/Blueprint.js';
import type { FieldSchema } from '@moteurio/types/Field.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type {
    GitCommitHook,
    MediaGenerator,
    MediaTransform,
    MediaVariantPreset
} from './extensions.js';
import type { PluginCommandSpec } from '@moteurio/types/PluginCommand.js';
import type {
    PluginFormAction,
    PluginFormField,
    PluginSubmissionHold,
    PluginSubmissionScreen
} from '@moteurio/types/FormPlugin.js';

export type HostPluginScope = 'global' | 'project';

export interface HostPluginManifest extends PluginManifest {
    scope?: HostPluginScope;
}

export type PluginInitContext = {
    onEvent: (...args: any[]) => any;
    isPluginEnabledForProject: (projectId: string, pluginId: string) => Promise<boolean>;
    registerStorageAdapterFactory: (id: string, factory: (config: unknown) => unknown) => void;
    registerVideoProviderFactory: (id: string, factory: (config: unknown) => unknown) => void;
    setVideoProvidersConfig: (config: VideoProvidersConfig | null) => void;
    registerBlockSchema: (schema: BlockSchema) => void;
    /**
     * Transforms the data of this plugin's blocks of the given `type` before a channel delivers
     * them to sites. The resolver receives the block's data in the requested language, for blocks
     * at any depth, and returns the data to deliver. The result is cached with the channel's
     * response, so the resolver runs once per content change and not once per request. If it
     * throws or takes longer than 3 seconds, the block is delivered unchanged.
     */
    registerBlockDelivery: (
        type: string,
        resolve: (
            data: Record<string, unknown>,
            context: { projectId: string; locale?: string }
        ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>
    ) => void;
    registerStructureSchema: (schema: StructureSchema) => void;
    registerBlueprint: (blueprint: BlueprintSchema) => void;
    registerFieldSchema: (field: FieldSchema) => void;
    registerCommand: (spec: PluginCommandSpec) => void;
    /** Registers a command with `surfaces: ['mcp']`, equivalent to calling `registerCommand` with that option. */
    registerMcpTool: (spec: PluginCommandSpec) => void;
    registerMediaVariantPreset: (preset: MediaVariantPreset) => void;
    registerMediaTransform: (transform: MediaTransform) => void;
    registerMediaGenerator: (generator: MediaGenerator) => void;
    registerModelTemplate: (schema: ModelSchema) => void;
    registerGitCommitHook: (hook: GitCommitHook) => void;
    registerGitProvider: (id: string) => void;
    registerOutboundWebhookEvent: (event: string) => void;
    /** Registers an action that a form can run when a submission arrives, such as `sheets:append`, together with the settings the action needs. */
    registerFormAction: (action: PluginFormAction) => void;
    /** Registers the server-side validation for the values of a plugin-provided field type in forms. */
    registerFormField: (field: PluginFormField) => void;
    /** Registers a spam check that runs after the honeypot, the time trap and the captcha. */
    registerSubmissionScreen: (screen: PluginSubmissionScreen) => void;
    /** Registers a hold that keeps a submission's actions pending (status `held`) until the plugin releases them. */
    registerSubmissionHold: (hold: PluginSubmissionHold) => void;
    /** Sets the function that returns each project's monthly AI credit allowance. The function returns null for unlimited. Passing null instead of a function restores the default. */
    setCreditAllowance: (allowance: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns how many people a project may have, counting members and
     * pending invites. The function returns null for no limit. Exceeding the limit returns a 402
     * `plan_limit` response. Passing null instead of a function removes the limit.
     */
    setPeopleLimit: (limit: ((projectId: string) => number | null) | null) => void;
    /** Sets the function that returns how many bytes of files a project may store, or null for no limit. Uploads over the limit return a 402 `plan_limit` response. */
    setStorageLimit: (limit: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns how many public API requests a project may make per calendar
     * month (UTC), or null for no limit. Once the quota is used up, public requests return a 402
     * `plan_limit` response until the month ends.
     */
    setRequestQuota: (quota: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns the number of public API requests per calendar month (UTC)
     * above which the host shows its fair use notice, or null for none. This is not a limit and
     * never rejects a request. Use setRequestQuota to enforce a limit.
     */
    setRequestFairUse: (fairUse: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns how many bytes of images a project may serve per calendar
     * month (UTC), or null for no limit. The quota covers originals and resized variants served to
     * sites and browsers. A revalidation by a browser or CDN that is answered with 304 does not
     * count. Once the quota is used up, image requests return a 402 `plan_limit` response until the month ends.
     */
    setImageTrafficQuota: (quota: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns the number of image bytes per calendar month (UTC) above
     * which the host shows its fair use notice, or null for none. This is not a limit and images
     * are never withheld. Use setImageTrafficQuota to enforce a limit.
     */
    setImageTrafficFairUse: (fairUse: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns how many form submissions a project may receive per calendar
     * month (UTC), or null for no limit. Past the quota, submissions return a 402 `plan_limit`
     * response. Submissions caught by the honeypot do not count.
     */
    setSubmissionQuota: (quota: ((projectId: string) => number | null) | null) => void;
    /**
     * Sets the function that returns how many projects a user may create, as `taken` out of `max`,
     * or null for no limit. Creating a project beyond `max` returns a 402 `plan_limit` response.
     * The plugin decides what counts toward the limit, for example only the user's free projects.
     */
    setProjectsLimit: (
        limit: ((userId: string) => { taken: number; max: number } | null) | null
    ) => void;
    /**
     * Sets the function that returns how many items of a kind a project may have, or null for no
     * limit. The kinds are `channels`, `models`, `entries`, `forms`, `structures`, `blocks`,
     * `templates` and `pages`. Creating an item beyond the limit returns a 402 `plan_limit`
     * response, and items that already exist are kept.
     */
    setCountLimit: (
        limit:
            | ((
                  projectId: string,
                  kind:
                      | 'channels'
                      | 'models'
                      | 'entries'
                      | 'forms'
                      | 'structures'
                      | 'blocks'
                      | 'templates'
                      | 'pages'
              ) => number | null)
            | null
    ) => void;
    /** Adds credits to a project for the current month. A negative amount removes credits. The change is recorded in the ledger. */
    grantCredits: (
        projectId: string,
        amount: number,
        detail?: { reason?: string; userId?: string }
    ) => unknown;
    /** Returns a project's credit balance for the current month. */
    creditBalance: (projectId: string) => {
        period: string;
        allowance: number | null;
        granted: number;
        used: number;
        remaining: number | null;
    };
};

export type HostPluginModule = {
    manifest: HostPluginManifest;
    init(ctx: PluginInitContext): void | Promise<void>;
    getRoutes?(ctx: PluginRouteContext): PluginRouteContribution | PluginRouteContribution[];
    getAuthProviders?(): AuthProviderContribution[];
    attachServer?(server: import('http').Server, app: unknown): void;
};

export type HostPluginRegistration = {
    id: string;
    loader: () => Promise<{ default: HostPluginModule }>;
    enabled?: boolean;
};

export type HostPluginRuntimeConfig = {
    plugins: HostPluginRegistration[];
};

export type PluginOpenApiPaths = Record<string, unknown>;

export function definePlugin(plugin: HostPluginModule): HostPluginModule {
    return plugin;
}

export type {
    FormActionContext,
    FormActionOutcome,
    FormActionSetting,
    FormFieldCheck,
    PluginFormAction,
    PluginFormField,
    PluginSubmissionHold,
    PluginSubmissionScreen,
    SubmissionHoldContext,
    SubmissionScreenContext,
    SubmissionScreenVerdict
} from '@moteurio/types/FormPlugin.js';
export type {
    GitCommitHook,
    GitCommitHookPayload,
    MediaGenerator,
    MediaGeneratorResult,
    MediaTransform,
    MediaTransformContext,
    MediaVariantPreset,
    ModelTemplate
} from './extensions.js';

export {
    beginOAuth,
    completeOAuth,
    oauthChallenge,
    oauthConfig,
    readOAuthConfig,
    redirectAfterLogin,
    redirectProviderSignIn,
    redirectLoginFailed,
    safeNext,
    discoverOidcIssuer,
    exchangeAuthorizationCode,
    fetchOidcUserInfo,
    parseJwtPayload,
    emailFromOidcClaims,
    type OAuthConfig,
    type OAuthFailure,
    type OidcDiscovery
} from './oauth.js';
