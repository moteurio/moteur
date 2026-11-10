import type { User } from './User.js';

export type PluginSource = 'local' | 'npm' | 'builtin' | 'opensource' | 'private';
export type PluginScope = 'global' | 'project';

/**
 * Catalog category on the manifest. It is separate from the operator API's `PluginEntry.kind`,
 * which is only `core` or `host`.
 * - `core`: built-in engine plugins registered from `@moteurio/core`.
 * - `optional`: regular packages loaded by the host (most `@moteurio/plugin-*`).
 * - `project`: alias for plugins gated per project. Prefer `scope: 'project'`.
 */
export type PluginKind = 'core' | 'optional' | 'project';

/**
 * Whether a plugin is a platform subsystem (`platform`) or an adapter or content pack
 * (`integration`). Defaults to `integration` when omitted. This is separate from the engine's
 * `PluginEntry.kind === 'core'`, which marks always-on built-in plugins.
 */
export type PluginRole = 'platform' | 'integration';

/** Domain tags used by catalogs, documentation and operator filters. */
export type PluginCategory =
    | 'auth'
    | 'webhook'
    | 'content'
    | 'storage'
    | 'video'
    | 'search'
    | 'ai'
    | 'billing'
    | 'presence'
    | 'commerce'
    | 'forms'
    | 'privacy';

export type PlanLimitKind =
    'channels' | 'models' | 'entries' | 'forms' | 'structures' | 'blocks' | 'templates' | 'pages';

/**
 * @deprecated Use `contributes` (`api`, `auth`) instead.
 * Optional capabilities a plugin declares for documentation and operator UIs.
 */
export type PluginCapability = 'routes' | 'openapi' | 'auth-provider';

/**
 * Machine-readable list of the parts of the system a plugin extends. Authors can declare a subset;
 * the host merges it with what the plugin's `init()` and module hooks actually register.
 */
export interface PluginContributions {
    api?: {
        mounts?: string[];
        openApi?: boolean;
        routePaths?: string[];
    };
    auth?: { providers?: string[] };
    webhooks?: { inbound?: string[]; outboundEvents?: string[] };
    schemas?: {
        blocks?: string[];
        structures?: string[];
        blueprints?: string[];
        fields?: string[];
        /** Model templates the plugin ships. Currently these are provided as blueprints. */
        models?: string[];
        layouts?: string[];
        templates?: string[];
        forms?: string[];
        menus?: string[];
    };
    adapters?: {
        storage?: string[];
        video?: string[];
    };
    video?: { activeProvider?: string };
    search?: { backend?: string };
    extensions?: { aiProviders?: string[] };
    planLimits?: {
        aiCredits?: boolean;
        people?: boolean;
        storageBytes?: boolean;
        apiRequests?: boolean;
        /** Sets the request volume at which the fair-use notice on public requests starts. It never enforces a limit. */
        requestFairUse?: boolean;
        imageTraffic?: boolean;
        /** Sets the traffic volume at which the fair-use notice on image traffic starts. It never enforces a limit. */
        imageTrafficFairUse?: boolean;
        formSubmissions?: boolean;
        projectsPerUser?: boolean;
        counts?: PlanLimitKind[];
    };
    events?: { subscribes?: string[] };
    /** Form actions, field checks, spam checks and holds that the plugin adds. */
    forms?: { actions?: string[]; fields?: string[]; screens?: string[]; holds?: string[] };
    server?: { attach?: boolean };
    platform?: { onlinePresence?: boolean };
    storage?: { projectKeys?: string[] };
    studio?: PluginStudioHints;
    /** Optional npm package with renderers (web components) for sites and content delivery. */
    frontend?: PluginFrontendHints;
    studioUi?: {
        fieldEditors?: string[];
        blockPreviews?: string[];
        projectRoutes?: string[];
        operatorRoutes?: string[];
    };
    metering?: { mutatesCredits?: boolean };
    /** Commands registered through `registerCommand` and `registerMcpTool`. */
    commands?: { cli?: string[]; mcp?: string[] };
    mcp?: { tools?: string[] };
    media?: {
        variants?: string[];
        transforms?: string[];
        generators?: string[];
    };
    git?: { commitHooks?: boolean; providers?: string[] };
    operator?: { studio?: boolean; apiRoutes?: string[] };
    integrations?: { projectConfigSchema?: string };
    radar?: { checks?: string[] };
    schedules?: { jobKinds?: string[] };
    /** Validation hooks. Reserved for a validation registry that is not implemented yet. */
    validation?: { hooks?: string[] };
}

/**
 * Declarative hints for a companion admin UI package. The API holds only these hints and no UI
 * code. Companions are separate packages that the admin client includes at build time; see
 * docs/Plugin architecture.md.
 */
export interface PluginStudioHints {
    /** Name of the companion admin UI package, for example `@moteurio/studio-plugin-qr`. */
    companionPackage?: string;
    /** IDs of the field types this plugin registers on the API. A companion UI package can provide editors for them. */
    fieldTypes?: string[];
    /** IDs of the block types this plugin registers on the API. */
    blockTypes?: string[];
    /** Project-scoped routes that the companion UI adds. Navigation entries for them are gated at build time and at runtime. */
    projectRoutes?: {
        path: string;
        /** Translation key of the route's label in the admin client's message catalogues. */
        labelKey?: string;
        roles?: string[];
    }[];
    operatorRoutes?: { path: string; labelKey?: string }[];
}

/** Declarative hints for an optional npm package that provides site rendering code. */
export interface PluginFrontendHints {
    companionPackage?: string;
    blocks?: string[];
    webComponents?: string[];
}

/**
 * Minimal description of a plugin, as stored in the global registry.
 */
export interface PluginManifest {
    id: string; // Unique plugin ID (for example 'hello-world')
    label: string; // Display name
    description?: string; // Short description
    icon?: string; // Emoji or icon class
    version?: string; // Semantic version, when known
    source: PluginSource; // Where the plugin is loaded from
    /**
     * `global`: not gated by `project.plugins`, but the host must still load it and the operator
     * must enable it.
     * `project`: also gated by `project.plugins` when that list is set.
     */
    scope?: PluginScope;
    /** Catalog category; see `PluginKind`. Per-project gating uses `scope`, not `kind`. */
    kind?: PluginKind;
    /** `platform` for a subsystem, `integration` for an adapter or pack. Defaults to `integration`. */
    role?: PluginRole;
    /** Domain tags used by catalogs and operator filters. */
    categories?: PluginCategory[];
    /** Declared contributions. The host merges them with the contributions it derives at runtime. */
    contributes?: PluginContributions;
    /** IDs of plugins that must be loaded first. The host logs a warning when one is missing. */
    requires?: string[];
    basePath?: string; // Base path of a local plugin (for example './plugins/hello-world')
    /**
     * @deprecated Use `contributes.api` / `contributes.auth` instead.
     */
    capabilities?: PluginCapability[];
    /** Optional metadata for a companion admin UI: its npm package and the field and block types it supports. */
    studio?: PluginStudioHints;
}

/**
 * Descriptor of a plugin enabled for one project, used in the project config.
 */
export interface PluginDescriptor {
    id: string;
    source: PluginSource;
    path?: string; // Set for local plugins only
    packageName?: string; // Set for npm plugins only
}

/**
 * A plugin instance after it has been loaded dynamically.
 */
export interface PluginModule {
    name: string;
    dataPath: string;

    manifest?: PluginManifest;
    api?: any; // Extension of the developer API
    openapi?: any; // OpenAPI spec
    routes?: {
        //router: import('express').Router;
        spec: any /* Record<string, import('openapi-types').OpenAPIV3.PathItemObject>*/;
    };
    storage?: any; // StorageAdapter export
    tests?: any; // Test exports
}

type RequestHandler = (...args: any[]) => any;

/**
 * Context the API passes to a plugin's `getRoutes()`. Plugins that register routes receive the
 * authentication middleware through it, so they can protect their routes without depending on the
 * API package.
 */
export interface PluginRouteContext {
    requireAuth: RequestHandler;
    requireProjectAccess: RequestHandler;
    /** Middleware that requires an operator session from `/operator/auth` (password and authenticator). User tokens are always rejected. */
    requireOperator: RequestHandler;
    /** Callbacks the API provides to auth provider plugins, for example to run onboarding after an OAuth sign-up. */
    authCallbacks?: {
        runOnboardingForNewUser(user: User): Promise<void>;
    };
}

export interface PluginRouteContribution {
    path: string;
    router: any;
    openapi?: { paths?: Record<string, unknown> };
}

export interface AuthProviderContribution {
    id: string;
    label: string;
    /**
     * Whether the provider can be used with the current runtime configuration. Plugins should
     * compute this from their own environment requirements.
     */
    enabled: boolean;
    loginPath?: string;
    callbackPath?: string;
}

function uniqueStrings(values: (string | undefined)[]): string[] {
    return [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

function mergeStringLists(a?: string[], b?: string[]): string[] | undefined {
    if (!a?.length && !b?.length) return undefined;
    const out = uniqueStrings([...(a ?? []), ...(b ?? [])]);
    return out.length ? out : undefined;
}

function orBool(a?: boolean, b?: boolean): boolean | undefined {
    if (a || b) return true;
    return undefined;
}

/**
 * Deep-merges declared and derived contributions. Arrays are combined without duplicates and
 * booleans are combined with OR. Where a value is single (the active video provider, the search
 * backend, studio hints, the project config schema), the derived value wins over the declared one.
 */
export function mergeContributions(
    declared?: PluginContributions | null,
    derived?: PluginContributions | null
): PluginContributions {
    const a = declared ?? {};
    const b = derived ?? {};
    const out: PluginContributions = {};

    const apiMounts = mergeStringLists(a.api?.mounts, b.api?.mounts);
    const routePaths = mergeStringLists(a.api?.routePaths, b.api?.routePaths);
    const openApi = orBool(a.api?.openApi, b.api?.openApi);
    if (apiMounts || routePaths || openApi) {
        out.api = {
            ...(apiMounts ? { mounts: apiMounts } : {}),
            ...(openApi ? { openApi: true } : {}),
            ...(routePaths ? { routePaths } : {})
        };
    }

    const providers = mergeStringLists(a.auth?.providers, b.auth?.providers);
    if (providers) out.auth = { providers };

    const inbound = mergeStringLists(a.webhooks?.inbound, b.webhooks?.inbound);
    const outbound = mergeStringLists(a.webhooks?.outboundEvents, b.webhooks?.outboundEvents);
    if (inbound || outbound) {
        out.webhooks = {
            ...(inbound ? { inbound } : {}),
            ...(outbound ? { outboundEvents: outbound } : {})
        };
    }

    const schemas: NonNullable<PluginContributions['schemas']> = {};
    for (const key of [
        'blocks',
        'structures',
        'blueprints',
        'fields',
        'models',
        'layouts',
        'templates',
        'forms',
        'menus'
    ] as const) {
        const list = mergeStringLists(a.schemas?.[key], b.schemas?.[key]);
        if (list) schemas[key] = list;
    }
    if (Object.keys(schemas).length) out.schemas = schemas;

    const storage = mergeStringLists(a.adapters?.storage, b.adapters?.storage);
    const videoAdapters = mergeStringLists(a.adapters?.video, b.adapters?.video);
    if (storage || videoAdapters) {
        out.adapters = {
            ...(storage ? { storage } : {}),
            ...(videoAdapters ? { video: videoAdapters } : {})
        };
    }

    const activeProvider = b.video?.activeProvider ?? a.video?.activeProvider;
    if (activeProvider) out.video = { activeProvider };

    const searchBackend = b.search?.backend ?? a.search?.backend;
    if (searchBackend) out.search = { backend: searchBackend };

    const aiProviders = mergeStringLists(a.extensions?.aiProviders, b.extensions?.aiProviders);
    if (aiProviders) out.extensions = { aiProviders };

    const counts = mergeStringLists(a.planLimits?.counts, b.planLimits?.counts) as
        PlanLimitKind[] | undefined;
    const plan: NonNullable<PluginContributions['planLimits']> = {};
    if (orBool(a.planLimits?.aiCredits, b.planLimits?.aiCredits)) plan.aiCredits = true;
    if (orBool(a.planLimits?.people, b.planLimits?.people)) plan.people = true;
    if (orBool(a.planLimits?.storageBytes, b.planLimits?.storageBytes)) plan.storageBytes = true;
    if (orBool(a.planLimits?.apiRequests, b.planLimits?.apiRequests)) plan.apiRequests = true;
    if (orBool(a.planLimits?.requestFairUse, b.planLimits?.requestFairUse)) {
        plan.requestFairUse = true;
    }
    if (orBool(a.planLimits?.imageTrafficFairUse, b.planLimits?.imageTrafficFairUse)) {
        plan.imageTrafficFairUse = true;
    }
    if (orBool(a.planLimits?.formSubmissions, b.planLimits?.formSubmissions)) {
        plan.formSubmissions = true;
    }
    if (orBool(a.planLimits?.projectsPerUser, b.planLimits?.projectsPerUser)) {
        plan.projectsPerUser = true;
    }
    if (counts?.length) plan.counts = counts;
    if (Object.keys(plan).length) out.planLimits = plan;

    const subscribes = mergeStringLists(a.events?.subscribes, b.events?.subscribes);
    if (subscribes) out.events = { subscribes };

    if (orBool(a.server?.attach, b.server?.attach)) out.server = { attach: true };
    if (orBool(a.platform?.onlinePresence, b.platform?.onlinePresence)) {
        out.platform = { onlinePresence: true };
    }

    const projectKeys = mergeStringLists(a.storage?.projectKeys, b.storage?.projectKeys);
    if (projectKeys) out.storage = { projectKeys };

    const studio = b.studio ?? a.studio;
    if (studio) out.studio = studio;

    const fieldEditors = mergeStringLists(a.studioUi?.fieldEditors, b.studioUi?.fieldEditors);
    const blockPreviews = mergeStringLists(a.studioUi?.blockPreviews, b.studioUi?.blockPreviews);
    const projectRoutes = mergeStringLists(a.studioUi?.projectRoutes, b.studioUi?.projectRoutes);
    const operatorRoutes = mergeStringLists(a.studioUi?.operatorRoutes, b.studioUi?.operatorRoutes);
    if (fieldEditors || blockPreviews || projectRoutes || operatorRoutes) {
        out.studioUi = {
            ...(fieldEditors ? { fieldEditors } : {}),
            ...(blockPreviews ? { blockPreviews } : {}),
            ...(projectRoutes ? { projectRoutes } : {}),
            ...(operatorRoutes ? { operatorRoutes } : {})
        };
    }

    if (orBool(a.metering?.mutatesCredits, b.metering?.mutatesCredits)) {
        out.metering = { mutatesCredits: true };
    }

    const cli = mergeStringLists(a.commands?.cli, b.commands?.cli);
    const mcpCmds = mergeStringLists(a.commands?.mcp, b.commands?.mcp);
    if (cli || mcpCmds) {
        out.commands = {
            ...(cli ? { cli } : {}),
            ...(mcpCmds ? { mcp: mcpCmds } : {})
        };
    }

    const mcpTools = mergeStringLists(a.mcp?.tools, b.mcp?.tools);
    if (mcpTools) out.mcp = { tools: mcpTools };

    const variants = mergeStringLists(a.media?.variants, b.media?.variants);
    const transforms = mergeStringLists(a.media?.transforms, b.media?.transforms);
    const generators = mergeStringLists(a.media?.generators, b.media?.generators);
    if (variants || transforms || generators) {
        out.media = {
            ...(variants ? { variants } : {}),
            ...(transforms ? { transforms } : {}),
            ...(generators ? { generators } : {})
        };
    }

    const gitProviders = mergeStringLists(a.git?.providers, b.git?.providers);
    if (orBool(a.git?.commitHooks, b.git?.commitHooks) || gitProviders) {
        out.git = {
            ...(orBool(a.git?.commitHooks, b.git?.commitHooks) ? { commitHooks: true } : {}),
            ...(gitProviders ? { providers: gitProviders } : {})
        };
    }

    const apiRoutes = mergeStringLists(a.operator?.apiRoutes, b.operator?.apiRoutes);
    if (orBool(a.operator?.studio, b.operator?.studio) || apiRoutes) {
        out.operator = {
            ...(orBool(a.operator?.studio, b.operator?.studio) ? { studio: true } : {}),
            ...(apiRoutes ? { apiRoutes } : {})
        };
    }

    const projectConfig =
        b.integrations?.projectConfigSchema ?? a.integrations?.projectConfigSchema;
    if (projectConfig) out.integrations = { projectConfigSchema: projectConfig };

    const radar = mergeStringLists(a.radar?.checks, b.radar?.checks);
    if (radar) out.radar = { checks: radar };

    const jobKinds = mergeStringLists(a.schedules?.jobKinds, b.schedules?.jobKinds);
    if (jobKinds) out.schedules = { jobKinds };

    const hooks = mergeStringLists(a.validation?.hooks, b.validation?.hooks);
    if (hooks) out.validation = { hooks };

    return out;
}

/** Builds the deprecated `capabilities` list from `contributes`, for clients that still read it. */
export function capabilitiesFromContributions(
    contributes?: PluginContributions | null,
    fallback?: PluginCapability[]
): PluginCapability[] {
    const caps = new Set<PluginCapability>(fallback ?? []);
    if (contributes?.api?.mounts?.length) caps.add('routes');
    if (contributes?.api?.openApi) caps.add('openapi');
    if (contributes?.auth?.providers?.length) caps.add('auth-provider');
    return [...caps];
}
