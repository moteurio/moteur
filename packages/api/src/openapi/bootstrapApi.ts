/**
 * Shared bootstrap: plugin registration, OpenAPI path collection, merged spec.
 * Used by the HTTP server and by `scripts/export-openapi.ts`.
 */
import type { OpenAPIV3 } from 'openapi-types';
import type { Router } from 'express';
import type { AuthProviderContribution } from '@moteurio/types/Plugin.js';

import '@moteurio/core';
import { registerCorePlugins, registerHostPlugins } from '@moteurio/core';
import '@moteurio/core/assets/index.js';
import { initAiFromEnv, createAiRouter, getAiOpenApiPaths } from '@moteurio/ai';
import { createPresenceRouter, presenceOpenApiPaths } from '@moteurio/presence';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

import { baseSpec } from '../openapi.js';
import { authSpecs } from '../auth/index.js';
import { projectsSpecs } from '../projects/index.js';
import { openapi as blueprintsSpec, schemas as blueprintsSchemas } from '../blueprints/index.js';
import { modelsSpecs } from '../models/index.js';
import { entriesSpecs } from '../entries/index.js';
import { openapi as activityGlobalSpec } from '../activity/index.js';
import { openapi as usageSpec } from '../studio/usage.js';
import { openapi as assetsMigrateSpec } from '../studio/assets/migrate.js';
import { openapi as seedSpec } from '../studio/seed.js';
import { openapi as blocksSpec } from '../public/blocks.js';
import { openapi as webhooksAssetsSpec } from '../webhooks/assets.js';
import { requireAuth, requireProjectAccess, requireOperator } from '../middlewares/auth.js';
import { runOnboardingForNewUser } from '../auth/onboarding.js';
import { mergePluginSpecs } from '../utils/mergePluginSpecs.js';
import { loadHostPluginsFromEnv } from '../plugins/hostPlugins.js';

type OpenApiHttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

export type PluginRouteContribution = {
    path: string;
    router: Router;
    openapi?: { paths?: Record<string, unknown> };
    pluginId?: string;
};

function withPluginId(
    pluginId: string,
    contribution: Omit<PluginRouteContribution, 'pluginId'>
): PluginRouteContribution {
    return { ...contribution, pluginId };
}

function toRouteContributions(
    pluginId: string,
    raw: PluginRouteContribution | PluginRouteContribution[] | undefined
): PluginRouteContribution[] {
    if (!raw) return [];
    const entries = Array.isArray(raw) ? raw : [raw];
    const out: PluginRouteContribution[] = [];
    for (const entry of entries) {
        if (typeof entry?.path !== 'string' || typeof entry.router !== 'function') {
            console.warn(`[api] Ignoring invalid route contribution from plugin "${pluginId}".`);
            continue;
        }
        out.push(withPluginId(pluginId, entry));
    }
    return out;
}

function toAuthProviders(
    pluginId: string,
    raw: AuthProviderContribution[] | undefined
): AuthProviderContribution[] {
    if (!Array.isArray(raw)) return [];
    const out: AuthProviderContribution[] = [];
    for (const p of raw) {
        if (!p || typeof p.id !== 'string' || typeof p.label !== 'string') {
            console.warn(`[api] Ignoring invalid auth provider from plugin "${pluginId}".`);
            continue;
        }
        out.push({
            id: p.id,
            label: p.label,
            enabled: !!p.enabled,
            ...(p.loginPath ? { loginPath: p.loginPath } : {}),
            ...(p.callbackPath ? { callbackPath: p.callbackPath } : {})
        });
    }
    return out;
}

function shouldExposeAuthCallbacks(pluginId: string, hostPlugins: HostPluginModule[]): boolean {
    const plugin = hostPlugins.find(p => p.manifest.id === pluginId);
    if (!plugin) return false;
    const caps = plugin.manifest.capabilities ?? [];
    return caps.includes('auth-provider') || pluginId.startsWith('auth-');
}

function mergePathsWithCollisionCheck(
    groups: Array<{ owner: string; paths?: OpenAPIV3.PathsObject }>,
    failOnCollision: boolean
): Record<string, OpenAPIV3.PathItemObject> {
    const result: Record<string, OpenAPIV3.PathItemObject> = {};
    const seen = new Map<string, string>();
    const methods: OpenApiHttpMethod[] = [
        'get',
        'put',
        'post',
        'delete',
        'options',
        'head',
        'patch',
        'trace'
    ];

    for (const group of groups) {
        for (const [path, item] of Object.entries(group.paths ?? {})) {
            if (!item) continue;
            const existing = result[path];
            if (!existing) {
                result[path] = item as OpenAPIV3.PathItemObject;
                for (const method of methods) {
                    if (item[method]) seen.set(`${method.toUpperCase()} ${path}`, group.owner);
                }
                continue;
            }

            const merged: OpenAPIV3.PathItemObject = { ...existing };
            for (const method of methods) {
                const op = item[method];
                if (!op) continue;
                const key = `${method.toUpperCase()} ${path}`;
                const previousOwner = seen.get(key);
                if (previousOwner && previousOwner !== group.owner) {
                    const msg = `[api] OpenAPI operation collision on ${key}: "${previousOwner}" vs "${group.owner}".`;
                    if (failOnCollision) throw new Error(msg);
                    console.warn(msg);
                }
                (merged as Record<string, unknown>)[method] = op;
                seen.set(key, group.owner);
            }
            result[path] = merged;
        }
    }
    return result;
}

function computeServerUrl(basePath: string): string {
    if (basePath === '') return '/';
    return basePath.startsWith('/')
        ? basePath.replace(/\/$/, '') || '/'
        : `/${basePath.replace(/\/$/, '')}`;
}

export type ApiBootstrapResult = {
    mergedApiSpecs: OpenAPIV3.Document;
    serverUrl: string;
    hostPlugins: HostPluginModule[];
    pluginRouteContributions: PluginRouteContribution[];
    authProviders: AuthProviderContribution[];
    routeContext: {
        requireAuth: typeof requireAuth;
        requireProjectAccess: typeof requireProjectAccess;
        requireOperator: typeof requireOperator;
        authCallbacks: { runOnboardingForNewUser: typeof runOnboardingForNewUser };
    };
};

export async function bootstrapApi(options?: {
    hostPlugins?: HostPluginModule[];
}): Promise<ApiBootstrapResult> {
    await registerCorePlugins();
    const hostPlugins = options?.hostPlugins ?? (await loadHostPluginsFromEnv());
    await registerHostPlugins(hostPlugins);
    await initAiFromEnv();

    const routeContext = {
        requireAuth,
        requireProjectAccess,
        requireOperator,
        authCallbacks: { runOnboardingForNewUser }
    };
    const pluginRouteContributions: PluginRouteContribution[] = [];
    const authProviders: AuthProviderContribution[] = [];
    const pluginPaths: Record<string, unknown> = {};

    pluginRouteContributions.push({
        path: '/ai',
        router: createAiRouter(routeContext),
        openapi: { paths: getAiOpenApiPaths() }
    });
    Object.assign(pluginPaths, getAiOpenApiPaths());

    pluginRouteContributions.push({
        path: '/projects',
        router: createPresenceRouter(routeContext),
        openapi: { paths: presenceOpenApiPaths }
    });
    Object.assign(pluginPaths, presenceOpenApiPaths);

    for (const plugin of hostPlugins) {
        try {
            const getRoutes = plugin.getRoutes;
            if (typeof getRoutes === 'function') {
                const ctx = shouldExposeAuthCallbacks(plugin.manifest.id, hostPlugins)
                    ? routeContext
                    : {
                          requireAuth,
                          requireProjectAccess,
                          requireOperator
                      };
                const contribs = toRouteContributions(
                    plugin.manifest.id,
                    getRoutes(ctx) as PluginRouteContribution | PluginRouteContribution[]
                );
                for (const contrib of contribs) {
                    pluginRouteContributions.push(contrib);
                    if (contrib.openapi?.paths) Object.assign(pluginPaths, contrib.openapi.paths);
                }
            }
            if (typeof plugin.getAuthProviders === 'function') {
                authProviders.push(
                    ...toAuthProviders(plugin.manifest.id, plugin.getAuthProviders())
                );
            }
        } catch (err) {
            console.warn(
                `[api] Failed to get routes from plugin "${plugin.manifest.id}":`,
                (err as Error).message
            );
        }
    }

    const failOnOpenApiCollision = process.env.MOTEUR_FAIL_ON_OPENAPI_COLLISION === '1';
    const mergedPaths = mergePathsWithCollisionCheck(
        [
            { owner: 'base', paths: baseSpec.paths },
            { owner: 'plugins', paths: pluginPaths as OpenAPIV3.PathsObject },
            { owner: 'auth-core', paths: authSpecs.paths as OpenAPIV3.PathsObject },
            { owner: 'projects-core', paths: projectsSpecs.paths as OpenAPIV3.PathsObject },
            { owner: 'blueprints-core', paths: blueprintsSpec as OpenAPIV3.PathsObject },
            { owner: 'activity-core', paths: activityGlobalSpec as OpenAPIV3.PathsObject },
            { owner: 'models-core', paths: modelsSpecs.paths as OpenAPIV3.PathsObject },
            { owner: 'entries-core', paths: entriesSpecs.paths as OpenAPIV3.PathsObject },
            { owner: 'studio-usage-core', paths: usageSpec as OpenAPIV3.PathsObject },
            { owner: 'studio-assets-core', paths: assetsMigrateSpec as OpenAPIV3.PathsObject },
            { owner: 'studio-seed-core', paths: seedSpec as OpenAPIV3.PathsObject },
            { owner: 'public-blocks-core', paths: blocksSpec as OpenAPIV3.PathsObject },
            { owner: 'webhooks-assets-core', paths: webhooksAssetsSpec as OpenAPIV3.PathsObject }
        ],
        failOnOpenApiCollision
    );

    const mergedApiSpecs = await mergePluginSpecs({
        ...baseSpec,
        paths: mergedPaths,
        components: {
            ...baseSpec.components,
            schemas: {
                ...baseSpec.components?.schemas,
                ...authSpecs.schemas,
                ...projectsSpecs.schemas,
                ...blueprintsSchemas
            }
        }
    });

    const basePath = process.env.API_BASE_PATH || '';
    const serverUrl = computeServerUrl(basePath);
    mergedApiSpecs.servers = [{ url: serverUrl }];

    return {
        mergedApiSpecs,
        serverUrl,
        hostPlugins,
        pluginRouteContributions,
        authProviders,
        routeContext
    };
}

/** OpenAPI document only (e.g. export tooling). Runs full plugin bootstrap. */
export async function buildMergedOpenApiDocument(): Promise<OpenAPIV3.Document> {
    const { mergedApiSpecs } = await bootstrapApi();
    return mergedApiSpecs;
}
