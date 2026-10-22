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
    registerStructureSchema: (schema: StructureSchema) => void;
    registerBlueprint: (blueprint: BlueprintSchema) => void;
    registerFieldSchema: (field: FieldSchema) => void;
    /** Who decides each project's monthly AI credits (null: unlimited); null restores the default. */
    setCreditAllowance: (allowance: ((projectId: string) => number | null) | null) => void;
    /**
     * Who decides how many people a project may have (members plus pending invites; null: no
     * limit). Going over answers 402 `plan_limit`. Null removes the limit.
     */
    setPeopleLimit: (limit: ((projectId: string) => number | null) | null) => void;
    /** Bytes of files a project may store (null: no limit). Uploads over it answer 402 `plan_limit`. */
    setStorageLimit: (limit: ((projectId: string) => number | null) | null) => void;
    /**
     * Public API requests a project may answer each calendar month (UTC; null: no limit). Once
     * they are used up, public requests answer 402 `plan_limit` until the month ends.
     */
    setRequestQuota: (quota: ((projectId: string) => number | null) | null) => void;
    /**
     * Form submissions a project may receive each calendar month (UTC; null: no limit). Past it,
     * submitting answers 402 `plan_limit`; submissions the honeypot catches don't count.
     */
    setSubmissionQuota: (quota: ((projectId: string) => number | null) | null) => void;
    /**
     * How many projects a person may start: `taken` of `max` (null: no limit). Creating one
     * more answers 402 `plan_limit`. The plugin decides what counts (e.g. their free projects).
     */
    setProjectsLimit: (
        limit: ((userId: string) => { taken: number; max: number } | null) | null
    ) => void;
    /**
     * How many of a kind a project may have (null: no limit): `channels`, `models`, `entries`,
     * `forms`, `structures`, `blocks`, `templates` or `pages`. Creating one more answers 402
     * `plan_limit`; what's already there stays.
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
    /** Add credits to a project this month (negative takes some back); recorded in the ledger. */
    grantCredits: (
        projectId: string,
        amount: number,
        detail?: { reason?: string; userId?: string }
    ) => unknown;
    /** A project's credits this month. */
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

export {
    beginOAuth,
    completeOAuth,
    oauthConfig,
    readOAuthConfig,
    redirectAfterLogin,
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
