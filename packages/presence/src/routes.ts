/**
 * HTTP routes for presence (ephemeral screen state, debug) and Socket.IO attachment.
 * Mounted by the API under `/projects`; Socket.IO is attached via `attachPresenceServer`.
 */
import { Router, type Request, type Response } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import type { PluginRouteContext } from '@moteurio/types/Plugin.js';
import { getProjectJson } from '@moteurio/core/utils/projectStorage.js';
import { PROJECT_KEY } from '@moteurio/core/utils/storageKeys.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { Server as HTTPServer } from 'http';
import type { Application } from 'express';
import { screenEphemeralStore } from './ScreenEphemeralStore.js';
import { presenceStore } from './PresenceStore.js';
import { createPresenceServer } from './server.js';

export function createPresenceRouter(ctx: PluginRouteContext): ReturnType<typeof Router> {
    const router = Router({ mergeParams: true });

    router.delete(
        '/:projectId/presence/screen/:screenId',
        ctx.requireAuth,
        (req: Request, res: Response) => {
            const { screenId } = req.params;
            if (!screenId) {
                res.status(400).json({ error: 'Missing screenId' });
                return;
            }
            screenEphemeralStore.clearScreen(screenId);
            res.json({ success: true });
        }
    );

    router.get(
        '/:projectId/presence/debug',
        ctx.requireProjectAccess,
        (req: Request, res: Response) => {
            const { projectId } = req.params;
            if (!projectId) {
                res.status(400).json({ error: 'Missing projectId' });
                return;
            }
            const presence = presenceStore.getByProject(projectId);
            const screenIds = new Set<string>();
            for (const p of presence) {
                if (p.screenId) screenIds.add(p.screenId);
            }
            const screenState: Record<
                string,
                { fields: Record<string, string>; ui: Record<string, string> }
            > = {};
            for (const sid of screenIds) {
                screenState[sid] = {
                    fields: screenEphemeralStore.getFieldsRecord(sid),
                    ui: screenEphemeralStore.getUiRecord(sid)
                };
            }
            res.json({ presence, screenState });
        }
    );

    return router;
}

export const presenceOpenApiPaths: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/presence/screen/{screenId}': {
        delete: {
            summary: 'Clear ephemeral screen state (LWW fields + UI) for a screen id',
            tags: ['Presence'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'screenId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Screen ephemeral state cleared',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { success: { type: 'boolean' } } }
                        }
                    }
                },
                '400': {
                    description: 'Missing screenId',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { error: { type: 'string' } } }
                        }
                    }
                }
            } as OpenAPIV3.ResponsesObject
        }
    },
    '/projects/{projectId}/presence/debug': {
        get: {
            summary: 'Inspect presence and ephemeral screen state in a project',
            tags: ['Presence'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Active presence and screen state',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    presence: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/Presence' }
                                    },
                                    screenState: {
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'object',
                                            properties: {
                                                fields: {
                                                    type: 'object',
                                                    additionalProperties: { type: 'string' }
                                                },
                                                ui: {
                                                    type: 'object',
                                                    additionalProperties: { type: 'string' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Missing projectId',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { error: { type: 'string' } } }
                        }
                    }
                }
            } as OpenAPIV3.ResponsesObject
        }
    }
};

/**
 * Attach the Socket.IO presence server to the HTTP server and set `app.locals.io`.
 * Join is allowed only when `project.presence.enabled !== false`.
 */
export function attachPresenceServer(httpServer: HTTPServer, app: Application): void {
    const isPresenceEnabledForProject = async (projectId: string): Promise<boolean> => {
        try {
            const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
            return project?.presence?.enabled !== false;
        } catch {
            return false;
        }
    };
    const io = createPresenceServer(httpServer, { isPresenceEnabledForProject });
    app.locals.io = io;
}
