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

/** Declared capabilities for docs and operator UI (optional). */
export type PluginCapability = 'routes' | 'openapi' | 'auth-provider';

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
    basePath?: string; // Base path for local plugins (e.g., './plugins/hello-world')
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
