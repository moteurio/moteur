import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostPluginModule } from '@moteurio/plugin-sdk';

vi.mock('@moteurio/core', () => ({
    registerCorePlugins: vi.fn(async () => {}),
    registerHostPlugins: vi.fn(async () => {})
}));

vi.mock('@moteurio/ai', () => ({
    initAiFromEnv: vi.fn(async () => {}),
    createAiRouter: vi.fn(() => express.Router()),
    getAiOpenApiPaths: vi.fn(() => ({}))
}));

vi.mock('@moteurio/presence', () => ({
    createPresenceRouter: vi.fn(() => express.Router()),
    presenceOpenApiPaths: {}
}));

vi.mock('../src/plugins/hostPlugins', () => ({
    loadHostPluginsFromEnv: vi.fn(async () => [])
}));

describe('bootstrapApi', () => {
    afterEach(() => {
        delete process.env.MOTEUR_FAIL_ON_OPENAPI_COLLISION;
        vi.restoreAllMocks();
    });

    it('collects auth providers from auth-capable plugins', async () => {
        const plugin: HostPluginModule = {
            manifest: {
                id: 'auth-mock',
                label: 'Auth Mock',
                source: 'private',
                capabilities: ['auth-provider']
            },
            init() {},
            getAuthProviders() {
                return [{ id: 'mock', label: 'Mock Login', enabled: true }];
            }
        };

        const { bootstrapApi } = await import('../src/openapi/bootstrapApi');
        const result = await bootstrapApi({ hostPlugins: [plugin] });

        expect(result.authProviders).toEqual([{ id: 'mock', label: 'Mock Login', enabled: true }]);
    });

    it('throws when openapi path+method collisions exist and fail mode is enabled', async () => {
        process.env.MOTEUR_FAIL_ON_OPENAPI_COLLISION = '1';
        const plugin: HostPluginModule = {
            manifest: {
                id: 'collision-plugin',
                label: 'Collision Plugin',
                source: 'private',
                capabilities: ['routes', 'openapi']
            },
            init() {},
            getRoutes() {
                return {
                    path: '/auth',
                    router: express.Router(),
                    openapi: {
                        paths: {
                            '/auth/login': {
                                post: {
                                    summary: 'Colliding login route from plugin',
                                    responses: { '200': { description: 'ok' } }
                                }
                            }
                        }
                    }
                };
            }
        };

        const { bootstrapApi } = await import('../src/openapi/bootstrapApi');
        await expect(bootstrapApi({ hostPlugins: [plugin] })).rejects.toThrow(
            /OpenAPI operation collision/
        );
    });

    it('warns (does not throw) on collision by default', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const plugin: HostPluginModule = {
            manifest: {
                id: 'collision-plugin',
                label: 'Collision Plugin',
                source: 'private',
                capabilities: ['routes', 'openapi']
            },
            init() {},
            getRoutes() {
                return {
                    path: '/auth',
                    router: express.Router(),
                    openapi: {
                        paths: {
                            '/auth/login': {
                                post: {
                                    summary: 'Colliding login route from plugin',
                                    responses: { '200': { description: 'ok' } }
                                }
                            }
                        }
                    }
                };
            }
        };

        const { bootstrapApi } = await import('../src/openapi/bootstrapApi');
        await expect(bootstrapApi({ hostPlugins: [plugin] })).resolves.toBeDefined();
        expect(
            warnSpy.mock.calls.some(call =>
                String(call[0]).includes('OpenAPI operation collision on POST /auth/login')
            )
        ).toBe(true);
    });
});
