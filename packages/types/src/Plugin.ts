// types/Plugin.ts

import type { User } from './User.js';

export type PluginSource = 'local' | 'npm' | 'builtin' | 'opensource' | 'private';
export type PluginScope = 'global' | 'project';

/**
 * Plugins are active when registered on the server; they can be enabled/disabled per-project (e.g. project.plugins or tier).
 * Core plugins (e.g. activity-log, audit) are built-in and always loaded at server start.
 * Host plugins are loaded by the host composition layer (e.g. MOTEUR_HOST_PLUGINS / MOTEUR_ENABLED_PLUGINS); per-project gating via project.plugins.
 * Git-commit, presence, and AI are core features (not plugins) and are always active; they are toggled per-project via project.git, project.presence, project.ai.
 */
export type PluginKind = 'core' | 'optional' | 'project';
export type PluginCapability = 'routes' | 'openapi' | 'auth-provider';

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
    /** `global`: host-wide; `project`: can be toggled per project. */
    scope?: PluginScope;
    kind?: PluginKind; // default 'project'; 'core' = built-in, always active
    basePath?: string; // Base path for local plugins (e.g., './plugins/hello-world')
    capabilities?: PluginCapability[];
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
    /** JWT user must have the platform operator role (see `OPERATOR_ROLE_SLUG` in @moteurio/types). */
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
