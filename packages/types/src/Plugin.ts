// types/Plugin.ts

import type { User } from './User.js';

export type PluginSource = 'local' | 'npm' | 'builtin' | 'opensource' | 'private';
export type PluginScope = 'global' | 'project';

/**
 * Catalog hint on the manifest (not the operator API's `PluginEntry.kind`, which is only `core` | `host`).
 * - `core`: engine built-in plugins registered from `@moteurio/core`.
 * - `optional`: normal host-loaded packages (most `@moteurio/plugin-*`).
 * - `project`: legacy alias; prefer **`scope: 'project'`** for per-project allowlists.
 */
export type PluginKind = 'core' | 'optional' | 'project';

/**
 * Subsystem vs adapter/pack. Default `integration` when omitted.
 * Distinct from engine `PluginEntry.kind === 'core'` (always-on builtins).
 */
export type PluginRole = 'platform' | 'integration';

/** Domain tags for catalogs, docs, and operator filters. */
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
 * Declared capabilities for docs and operator UI (optional).
 */
export type PluginCapability = 'routes' | 'openapi' | 'auth-provider';

/**
 * Machine-readable surfaces a plugin touches. Authors may declare a subset;
 * the host merges that with what `init()` / module hooks actually register.
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
        /** Shipped model templates (SDK planned; blueprints today). */
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
        imageTraffic?: boolean;
        formSubmissions?: boolean;
        projectsPerUser?: boolean;
        counts?: PlanLimitKind[];
    };
    events?: { subscribes?: string[] };
    /** Form actions, field checks, spam checks and holds the plugin adds. */
    forms?: { actions?: string[]; fields?: string[]; screens?: string[]; holds?: string[] };
    server?: { attach?: boolean };
    platform?: { onlinePresence?: boolean };
    storage?: { projectKeys?: string[] };
    studio?: PluginStudioHints;
    /** Optional npm package with site/delivery renderers (web components). */
    frontend?: PluginFrontendHints;
    studioUi?: {
        fieldEditors?: string[];
        blockPreviews?: string[];
        projectRoutes?: string[];
        operatorRoutes?: string[];
    };
    metering?: { mutatesCredits?: boolean };
    /** From `registerCommand` / `registerMcpTool`. */
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
    /** Planned validation registry */
    validation?: { hooks?: string[] };
}

/**
 * Declarative Studio companion hints (no React on the API).
 * Companions are separate packages composed at Studio build time; see docs/Plugin architecture.md.
 */
export interface PluginStudioHints {
    /** Studio UI package name, e.g. `@moteurio/studio-plugin-qr` (often shipped from moteur-plugins-extra). */
    companionPackage?: string;
    /** Field type ids this plugin registers on the API (Studio may ship editors). */
    fieldTypes?: string[];
    /** Block type ids this plugin registers on the API. */
    blockTypes?: string[];
    /** Project-scoped Studio routes (nav is build-time + runtime gated). */
    projectRoutes?: {
        path: string;
        /** i18n key in Studio catalogues. */
        labelKey?: string;
        roles?: string[];
    }[];
    operatorRoutes?: { path: string; labelKey?: string }[];
}

/** Declarative frontend/delivery companion hints (opt-in npm packages for sites). */
export interface PluginFrontendHints {
    companionPackage?: string;
    blocks?: string[];
    webComponents?: string[];
}

/**
 * Minimal description of a plugin, used in the global registry
 */
export interface PluginManifest {
    id: string; // Unique plugin ID (e.g., 'hello-world')
    label: string; // Human-readable name
    description?: string; // Optional short description
    icon?: string; // Emoji or icon class
    version?: string; // Semver (if known)
    source: PluginSource; // Where it's loaded from
    /**
     * `global`: not gated by `project.plugins` (still requires host load + operator choice).
     * `project`: also gated by `project.plugins` when that list is set.
     */
    scope?: PluginScope;
    /** Manifest catalog hint; see `PluginKind`. Per-project gating uses `scope`, not `kind`. */
    kind?: PluginKind;
    /** Subsystem (`platform`) vs adapter/pack (`integration`). Default integration. */
    role?: PluginRole;
    /** Domain tags for catalogs and operator filters. */
    categories?: PluginCategory[];
    /** Declared contributions; the host merges these with runtime-derived facts. */
    contributes?: PluginContributions;
    /** Other plugin ids that should be loaded first (host warns if missing). */
    requires?: string[];
    basePath?: string; // Base path for local plugins (e.g., './plugins/hello-world')
    /**
     * @deprecated Use `contributes.api` / `contributes.auth` instead.
     */
    capabilities?: PluginCapability[];
    /** Optional Studio extension metadata (companion npm package, field/block types). */
    studio?: PluginStudioHints;
}

/**
 * Per-project plugin descriptor, used in project config
 */
export interface PluginDescriptor {
    id: string;
    source: PluginSource;
    path?: string; // For local plugins only
    packageName?: string; // For npm plugins only
}

/**
 * Loaded plugin instance (after dynamic loading)
 */
export interface PluginModule {
    name: string;
    dataPath: string;

    manifest?: PluginManifest;
    api?: any; // Optional developer API extension
    openapi?: any; // Optional OpenAPI spec
    routes?: {
        //router: import('express').Router;
        spec: any /* Record<string, import('openapi-types').OpenAPIV3.PathItemObject>*/;
    };
    storage?: any; // Optional StorageAdapter export
    tests?: any; // Optional test exports
}

/**
 * Context passed by the API when calling a plugin's getRoutes().
 * Plugins that register routes receive auth middlewares so they can protect routes without depending on the API package.
 */
type RequestHandler = (...args: any[]) => any;

export interface PluginRouteContext {
    requireAuth: RequestHandler;
    requireProjectAccess: RequestHandler;
    /** An operator signed in on /operator/auth (password and authenticator); user tokens never pass. */
    requireOperator: RequestHandler;
    /** Optional; provided by the API for auth provider plugins (e.g. run onboarding after OAuth). */
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
     * Whether this provider is actually usable in the current runtime config.
     * Plugins should compute this from their own environment requirements.
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
 * Deep-merge declared and derived contributions. Arrays are unioned; booleans are OR'd.
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

/** Legacy `capabilities` mirror so older operator clients still see something familiar. */
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
