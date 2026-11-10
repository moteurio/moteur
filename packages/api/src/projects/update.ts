import type { Request, Response } from 'express';
import { Router } from 'express';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { requireProjectAdmin } from '../middlewares/auth.js';
import { getProject, applyProjectPatch, updateProject } from '@moteurio/core/projects.js';
import { validateProject } from '@moteurio/core/validators/validateProject.js';
import {
    redactProjectSecrets,
    updateProjectMediaSettings
} from '@moteurio/core/assets/mediaSettings.js';
import type { OpenAPIV3 } from 'openapi-types';
import { sendApiError } from '../utils/apiError.js';
import { gitRemoteRefusal } from '../utils/gitRemote.js';

const router: Router = Router();

router.patch('/:projectId', requireProjectAdmin, async (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    const patch = { ...(req.body ?? {}) } as Partial<ProjectSchema>;
    delete patch.memberRoles;
    // API keys are managed by developers through the API-key routes, so an admin's project patch cannot change them.
    delete patch.apiKeys;
    // The id names the project's folder and appears in every address, so it cannot be changed here.
    if (patch.id !== undefined && patch.id !== projectId)
        return void res.status(400).json({ error: 'A project’s id can’t be changed.' });
    // Media settings are validated separately, and secrets sent back as *** keep their stored values.
    const { assetConfig, videoProviders } = patch;
    delete patch.assetConfig;
    delete patch.videoProviders;
    // Members are added and removed through invites and the members routes, never through a project patch.
    delete patch.users;
    // A project changes workspace only when it is moved through the move route, never through a patch.
    delete patch.workspaceId;
    // The project's email settings are validated on their own route (PATCH /projects/:projectId/email).
    delete patch.email;
    const refusal = gitRemoteRefusal(patch.git);
    if (refusal) return void res.status(400).json({ error: refusal });

    try {
        const current = await getProject(req.user!, projectId);
        const merged = applyProjectPatch(current, patch);
        const validation = validateProject(merged, { existingProjectId: projectId });
        if (!validation.valid) {
            return void res
                .status(400)
                .json({ validation: validation.issues, error: 'Validation failed' });
        }

        if (assetConfig !== undefined || videoProviders !== undefined)
            await updateProjectMediaSettings(projectId, req.user!, { assetConfig, videoProviders });
        const project = await updateProject(req.user!, projectId, patch);
        return void res.json(redactProjectSecrets(project));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}': {
        patch: {
            summary: 'Update a project',
            description:
                'Project admins only. `memberRoles` is ignored (use PATCH /projects/{projectId}/users/{userId}); `users` is ignored unless the caller is a platform operator.',
            tags: ['Projects'],
            parameters: [
                {
                    name: 'projectId',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/UpdateProjectInput' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Project updated',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Project' }
                        }
                    }
                },
                '400': {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    error: { type: 'string' },
                                    validation: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                path: { type: 'string' },
                                                message: { type: 'string' }
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
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    UpdateProjectInput: {
        type: 'object',
        description:
            'Only the fields sent change. Members, member roles, API keys, the workspace and email settings have their own routes and are ignored here. `id` cannot change.',
        properties: {
            label: { type: 'string' },
            description: { type: 'string' },
            defaultLocale: {
                type: 'string',
                description: 'Used when a translation is missing'
            },
            supportedLocales: {
                type: 'array',
                items: { type: 'string' },
                description: 'Locales besides the default one'
            },
            localePrefix: {
                type: 'string',
                enum: ['others', 'all', 'none'],
                description: 'Which locales get a prefix in addresses'
            },
            isActive: { type: 'boolean' },
            plugins: { type: 'array', items: { type: 'string' } },
            namespaces: { type: 'array', items: { type: 'string' } },
            siteUrl: {
                type: 'string',
                description:
                    'The site’s base URL, such as `https://example.com`, used in the sitemap'
            },
            previewUrl: { type: 'string' },
            allowHtmlIframe: { type: 'boolean' },
            allowHtmlEmbed: { type: 'boolean' },
            workflow: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    mode: { type: 'string', enum: ['auto_publish'] },
                    requireReview: { type: 'boolean' }
                }
            },
            git: {
                type: 'object',
                properties: { enabled: { type: 'boolean' }, remoteUrl: { type: 'string' } }
            },
            assetConfig: { type: 'object', additionalProperties: true },
            videoProviders: { type: 'object', additionalProperties: true },
            ai: { type: 'object', additionalProperties: true },
            integrations: { type: 'object', additionalProperties: true },
            meta: { type: 'object', additionalProperties: true }
        }
    }
};

export default router;
