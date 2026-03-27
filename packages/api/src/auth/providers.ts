import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { AuthProviderContribution } from '@moteurio/types/Plugin.js';

function normalizeProviders(
    providers: AuthProviderContribution[]
): Array<{ id: string; label: string }> {
    const unique = new Map<string, { id: string; label: string }>();
    for (const p of providers) {
        if (!p.enabled) continue;
        if (!unique.has(p.id)) unique.set(p.id, { id: p.id, label: p.label });
    }
    return Array.from(unique.values());
}

export function createProvidersRoute(authProviders: AuthProviderContribution[] = []): Router {
    const providersRoute: Router = Router();
    providersRoute.get('/providers', (req, res) => {
        const providers = normalizeProviders(authProviders);
        res.json({ providers });
    });

    return providersRoute;
}

// --- OpenAPI Spec ---
export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/auth/providers': {
        get: {
            summary: 'List enabled auth providers',
            description:
                'Returns a list of OAuth providers (e.g., GitHub, Google) that are currently enabled based on environment config.',
            tags: ['Auth'],
            responses: {
                '200': {
                    description: 'Enabled providers',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    providers: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/AuthProvider'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    AuthProvider: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
            id: {
                type: 'string',
                description: 'Unique ID of the provider (e.g., github, google)'
            },
            label: {
                type: 'string',
                description: 'Human-readable label (e.g., GitHub)'
            }
        }
    }
};

export default createProvidersRoute();
