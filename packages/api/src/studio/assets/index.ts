import type { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import {
    uploadAsset,
    listAssets,
    getAsset,
    updateAsset,
    deleteAsset,
    moveToFolder,
    regenerateVariants
} from '@moteurio/core/assets/assetService.js';
import { getProject } from '@moteurio/core/projects.js';
import { getAdapter } from '@moteurio/ai';
import { getCredits, deductCredits, getCreditCost } from '@moteurio/ai';
import { analyseImage as runImageAnalysis } from '@moteurio/ai';
import { requireProjectAccess } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import type { AssetType } from '@moteurio/types/Asset.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

type ProjectParams = { projectId: string };
type AssetIdParams = { projectId: string; id: string };
type AssetListQuery = { type?: string; folder?: string; search?: string };
type AssetUploadBody = {
    folder?: string;
    alt?: string;
    title?: string;
    credit?: string;
    keepLocalCopy?: string | boolean;
};
type RegenerateBody = { assetIds?: string[] };
type MoveBody = { folder?: unknown };

function parseOptionalAssetType(raw: string | undefined): AssetType | undefined {
    if (raw === undefined || raw === '') return undefined;
    if (raw === 'image' || raw === 'video' || raw === 'document') return raw;
    return undefined;
}

const uploadMaxMb = Math.min(
    100,
    Math.max(1, parseInt(process.env.API_UPLOAD_MAX_MB || '50', 10) || 50)
);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadMaxMb * 1024 * 1024 }
});

router.post(
    '/',
    requireProjectAccess,
    upload.single('file'),
    async (req: Request<ProjectParams, unknown, AssetUploadBody>, res: Response) => {
        const { projectId } = req.params;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        const file = req.file;
        if (!file) return void res.status(400).json({ error: 'Missing file' });
        try {
            const { folder, alt, title, credit, keepLocalCopy: klc } = req.body;
            const keepLocalCopy = klc === 'true' || klc === true;
            let asset = await uploadAsset(
                projectId,
                req.user!,
                {
                    buffer: file.buffer,
                    originalName: file.originalname,
                    mimeType: file.mimetype
                },
                { folder, alt, title, credit, keepLocalCopy }
            );

            const project = await getProject(req.user!, projectId);
            if (
                project.ai?.enabled !== false &&
                project.ai?.autoAnalyseImages &&
                asset.type === 'image' &&
                asset.url &&
                !alt
            ) {
                const adapter = await getAdapter();
                if (adapter?.analyseImage) {
                    const cost = getCreditCost('analyse.image');
                    const balance = getCredits(projectId);
                    if (balance >= cost) {
                        const deduct = deductCredits(projectId, cost);
                        if (deduct.success) {
                            try {
                                const result = await runImageAnalysis(adapter, asset.url, {
                                    locale: project.defaultLocale ?? 'en'
                                });
                                asset = await updateAsset(projectId, req.user!, asset.id, {
                                    alt: result.alt,
                                    caption: result.caption
                                });
                            } catch {
                                // Analysis failed; return asset without alt/caption
                            }
                        }
                    }
                }
            }

            return void res.status(201).json(asset);
        } catch (err: unknown) {
            if (getMessage(err)?.includes('exceeds max'))
                return void res.status(413).json({ error: getMessage(err) });
            if (
                getMessage(err)?.includes('not allowed') ||
                getMessage(err)?.includes('Unsupported')
            )
                return void res.status(415).json({ error: getMessage(err) });
            return void res.status(500).json({ error: getMessage(err) ?? 'Upload failed' });
        }
    }
);

router.post(
    '/regenerate',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, RegenerateBody>, res: Response) => {
        const { projectId } = req.params;
        const rawIds = req.body?.assetIds;
        let assetIds: string[] | undefined;
        if (rawIds === undefined) {
            assetIds = undefined;
        } else if (
            Array.isArray(rawIds) &&
            rawIds.every((x): x is string => typeof x === 'string')
        ) {
            assetIds = rawIds;
        } else {
            return void res.status(400).json({ error: 'assetIds must be an array of strings' });
        }
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        try {
            const result = await regenerateVariants(projectId, req.user!, assetIds);
            return void res.json(result);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get(
    '/',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, unknown, AssetListQuery>, res: Response) => {
        const { projectId } = req.params;
        const { type: typeRaw, folder, search } = req.query;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        if (
            typeRaw !== undefined &&
            typeRaw !== '' &&
            parseOptionalAssetType(typeRaw) === undefined
        ) {
            return void res.status(400).json({ error: 'Invalid type filter' });
        }
        const type = parseOptionalAssetType(typeRaw);
        try {
            const assets = await listAssets(projectId, { type, folder, search });
            return void res.json(assets);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get('/:id', requireProjectAccess, async (req: Request<AssetIdParams>, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const asset = await getAsset(projectId, id);
        if (!asset) return void res.status(404).json({ error: 'Asset not found' });
        return void res.json(asset);
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.patch('/:id', requireProjectAccess, async (req: Request<AssetIdParams>, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        const asset = await updateAsset(projectId, req.user!, id, req.body);
        return void res.json(asset);
    } catch (err: unknown) {
        return void res
            .status(getMessage(err)?.includes('not found') ? 404 : 400)
            .json({ error: getMessage(err) ?? 'Update failed' });
    }
});

router.delete('/:id', requireProjectAccess, async (req: Request<AssetIdParams>, res: Response) => {
    const { projectId, id } = req.params;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteAsset(projectId, req.user!, id);
        res.set('X-Moteur-Warning', 'Deletion does not cascade to entries.');
        return void res.status(204).send();
    } catch (err: unknown) {
        return void res
            .status(getMessage(err)?.includes('not found') ? 404 : 500)
            .json({ error: getMessage(err) ?? 'Delete failed' });
    }
});

router.post(
    '/:id/move',
    requireProjectAccess,
    async (req: Request<AssetIdParams, unknown, MoveBody>, res: Response) => {
        const { projectId, id } = req.params;
        const folder = req.body?.folder;
        if (!projectId || !id)
            return void res.status(400).json({ error: 'Missing projectId or id' });
        if (typeof folder !== 'string')
            return void res.status(400).json({ error: 'Missing folder' });
        try {
            const asset = await moveToFolder(projectId, req.user!, id, folder);
            return void res.json(asset);
        } catch (err: unknown) {
            return void res
                .status(getMessage(err)?.includes('not found') ? 404 : 400)
                .json({ error: getMessage(err) ?? 'Move failed' });
        }
    }
);

const assetJson = {
    content: {
        'application/json': {
            schema: { $ref: '#/components/schemas/JsonRecord' }
        }
    }
};

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/assets': {
        get: {
            summary: 'List assets',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'type', in: 'query', schema: { type: 'string' } },
                { name: 'folder', in: 'query', schema: { type: 'string' } },
                { name: 'search', in: 'query', schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'List of assets',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: { $ref: '#/components/schemas/JsonRecord' }
                            }
                        }
                    }
                }
            }
        },
        post: {
            summary: 'Upload asset',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                file: { type: 'string', format: 'binary' },
                                folder: { type: 'string' },
                                alt: { type: 'string' },
                                title: { type: 'string' },
                                credit: { type: 'string' },
                                keepLocalCopy: { type: 'boolean' }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Asset created',
                    ...assetJson
                },
                '400': {
                    description: 'Missing file',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '413': {
                    description: 'File too large',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                },
                '415': {
                    description: 'Unsupported type',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/assets/regenerate': {
        post: {
            summary: 'Regenerate asset variants',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { assetIds: { type: 'array', items: { type: 'string' } } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Regeneration result',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/JsonRecord' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/assets/{id}': {
        get: {
            summary: 'Get asset by id',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Asset',
                    ...assetJson
                },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        patch: {
            summary: 'Update asset',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: { $ref: '#/components/schemas/JsonRecord' }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Asset updated',
                    ...assetJson
                },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        },
        delete: {
            summary: 'Delete asset',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted' },
                '404': {
                    description: 'Not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ErrorResponse' }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/move': {
        post: {
            summary: 'Move asset to folder',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['folder'],
                            properties: { folder: { type: 'string' } }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'Asset moved',
                    ...assetJson
                },
                '404': {
                    description: 'Not found',
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
