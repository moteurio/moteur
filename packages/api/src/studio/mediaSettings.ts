import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireProjectAccess, requireProjectAdmin } from '../middlewares/auth.js';
import {
    checkStorage,
    forgetVideoHost,
    getProjectMediaSettings,
    moveProjectStorage,
    moveProjectVideos,
    updateProjectMediaSettings
} from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

router.get('/', requireProjectAccess, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await getProjectMediaSettings(projectId, req.user!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/check-storage', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await checkStorage(projectId, req.user!, req.body ?? {}));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post('/move-storage', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await moveProjectStorage(projectId, req.user!, req.body ?? {}));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Videos to where new ones go (the project's host, or this server), in the background.
router.post('/move-videos', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await moveProjectVideos(projectId, req.user!, req.body ?? {}));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// Forget a video host's keys (only once no video is there).
router.delete('/video-hosts/:host', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId, host } = req.params as Record<string, string>;
    try {
        return void res.json({
            videoProviders: await forgetVideoHost(projectId, req.user!, host)
        });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const result = await updateProjectMediaSettings(projectId, req.user!, req.body ?? {});
        return void res.json(result);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

const projectParam: OpenAPIV3.ParameterObject = {
    name: 'projectId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};

const storageBody: OpenAPIV3.RequestBodyObject = {
    content: {
        'application/json': {
            schema: {
                type: 'object',
                properties: {
                    adapter: { type: 'string', description: 'Storage id, e.g. local, s3, r2' },
                    adapterConfig: {
                        type: 'object',
                        description: 'Secrets sent empty or as *** keep the stored ones'
                    }
                }
            }
        }
    }
};

const jsonRecord = (description: string): OpenAPIV3.ResponseObject => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/JsonRecord' } } }
});

const errorResponse = (description: string): OpenAPIV3.ResponseObject => ({
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/media-settings/check-storage': {
        post: {
            summary: 'Try storage settings before saving them',
            description:
                'Writes a small file, reads it back and deletes it. Answers `{ ok, error? }`. Project admins only.',
            tags: ['Media settings'],
            parameters: [projectParam],
            requestBody: storageBody,
            responses: {
                '200': jsonRecord('`{ ok: boolean, error?: string }`'),
                '403': errorResponse('Not a project admin')
            }
        }
    },
    '/projects/{projectId}/media-settings/move-storage': {
        post: {
            summary: 'Move every file to another storage and switch to it',
            description:
                'Checks the storage, copies every stored file there, then saves it as the project storage. Files stay on the old storage. Project admins only.',
            tags: ['Media settings'],
            parameters: [projectParam],
            requestBody: storageBody,
            responses: {
                '200': jsonRecord('`{ moved: number }`'),
                '400': errorResponse('Storage unavailable or check failed'),
                '403': errorResponse('Not a project admin')
            }
        }
    },
    '/projects/{projectId}/media-settings/move-videos': {
        post: {
            summary: 'Move the project’s videos to where new ones go',
            description:
                'To the project’s video host, or this server when it has none. Videos with a copy on this server are sent in the background (two at a time) and keep playing from where they are until ready; the others stay at their host. With `removeFromOld`, each is deleted at its old host once ready at the new one. Project admins only.',
            tags: ['Media settings'],
            parameters: [projectParam],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { removeFromOld: { type: 'boolean' } }
                        }
                    }
                }
            },
            responses: {
                '200': jsonRecord('`{ to, moving, staying }`'),
                '400': errorResponse('The project’s video host is not available'),
                '403': errorResponse('Not a project admin')
            }
        }
    },
    '/projects/{projectId}/media-settings/video-hosts/{host}': {
        delete: {
            summary: 'Forget a video host’s keys',
            description:
                'Kept otherwise, so videos still there can be deleted or moved. Refused for the host taking new videos (400 `host_active`) and while any video is there (409 `host_in_use`). Project admins only.',
            tags: ['Media settings'],
            parameters: [
                projectParam,
                { name: 'host', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': jsonRecord('`{ videoProviders }` as kept, secrets hidden'),
                '400': errorResponse('Unknown host, or the one taking new videos'),
                '403': errorResponse('Not a project admin'),
                '409': errorResponse('Videos are still at this host')
            }
        }
    },
    '/projects/{projectId}/media-settings': {
        get: {
            summary: 'Media settings',
            description:
                'Asset config and video hosts with secrets shown as *** (keys are kept for every host used), the storages and video hosts this server offers, the number of stored files, where the videos are (`videos`: per host or `local`, how many and how many have a copy here) and the defaults.',
            tags: ['Media settings'],
            parameters: [projectParam],
            responses: { '200': jsonRecord('Media settings') }
        },
        patch: {
            summary: 'Update media settings (asset config + video providers)',
            tags: ['Media settings'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                assetConfig: { type: 'object' },
                                videoProviders: { type: 'object', nullable: true }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Updated assetConfig (redacted) and videoProviders',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                },
                '403': errorResponse('Not a project admin'),
                '400': {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    }
};

export default router;
