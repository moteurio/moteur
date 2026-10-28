import type { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { uploadAdmission } from '../../middlewares/uploadAdmission.js';
import {
    uploadAsset,
    listAssets,
    listAssetPage,
    getAsset,
    updateAsset,
    deleteAsset,
    deleteAssetForever,
    emptyBin,
    listBinnedAssets,
    moveToFolder,
    regenerateVariants,
    queueRegenerateVariants,
    replaceAssetFile,
    restoreAsset,
    checkVideoStatus,
    retryVideoUpload,
    binAssets,
    restoreAssets,
    updateAssets,
    type AssetPatch
} from '@moteurio/core/assets/assetService.js';
import { assetUsage } from '@moteurio/core/assets/assetUsage.js';
import { downloadPublicFile } from '@moteurio/core/utils/publicDownload.js';
import { PlanLimitError } from '@moteurio/core/planLimits.js';
import { requireProjectAccess, requireProjectAdmin } from '../../middlewares/auth.js';
import type { OpenAPIV3 } from 'openapi-types';
import type { AssetType } from '@moteurio/types/Asset.js';
import { sendApiError, getMessage } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

/** An upload that didn't go through: too big (413), a kind not allowed (415), over the plan. */
function uploadFailed(res: Response, req: Request, err: unknown): void {
    if (err instanceof PlanLimitError) return void sendApiError(res, req, err);
    if (getMessage(err)?.includes('exceeds max'))
        return void res.status(413).json({ error: getMessage(err) });
    if (getMessage(err)?.includes('not allowed') || getMessage(err)?.includes('Unsupported'))
        return void res.status(415).json({ error: getMessage(err) });
    return void sendApiError(res, req, err);
}

type ProjectParams = { projectId: string };
type AssetIdParams = { projectId: string; id: string };
type AssetListQuery = {
    type?: string;
    folder?: string;
    search?: string;
    hash?: string;
    limit?: string;
    offset?: string;
    facets?: string;
};
type AssetUploadBody = {
    folder?: string;
    alt?: string;
    title?: string;
    credit?: string;
    keepLocalCopy?: string | boolean;
};
type RegenerateBody = { assetIds?: string[]; background?: boolean };
type MoveBody = { folder?: unknown };
type BatchBody = {
    action?: unknown;
    ids?: unknown;
    folder?: unknown;
    changes?: unknown;
};

function parseOptionalAssetType(raw: string | undefined): AssetType | undefined {
    if (raw === undefined || raw === '') return undefined;
    if (
        raw === 'image' ||
        raw === 'video' ||
        raw === 'audio' ||
        raw === 'document' ||
        raw === 'model'
    )
        return raw;
    return undefined;
}

const uploadMaxMb = Math.max(1, parseInt(process.env.API_UPLOAD_MAX_MB || '50', 10) || 50);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: uploadMaxMb * 1024 * 1024 }
});

router.post(
    '/',
    requireProjectAccess,
    uploadAdmission,
    upload.single('file'),
    async (req: Request<ProjectParams, unknown, AssetUploadBody>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        const file = req.file;
        if (!file) return void res.status(400).json({ error: 'Missing file' });
        try {
            const { folder, alt, title, credit, keepLocalCopy: klc } = req.body;
            // Not said: the project's setting (Setup › Media) decides.
            const keepLocalCopy =
                klc === undefined || klc === '' ? undefined : klc === 'true' || klc === true;
            // A file a helper made (speech, say), kept by the Studio: recorded as generated.
            const body = req.body as Record<string, unknown>;
            const generated =
                body.aiGenerated === 'true' || body.aiGenerated === true
                    ? {
                          aiGenerated: true,
                          ...(typeof body.generationPrompt === 'string'
                              ? { generationPrompt: body.generationPrompt.slice(0, 4000) }
                              : {}),
                          ...(typeof body.aiProvider === 'string'
                              ? { aiProvider: body.aiProvider.slice(0, 40) }
                              : {})
                      }
                    : {};
            // Plugins (AI descriptions) have had their turn: this is the asset as they left it.
            const asset = await uploadAsset(
                projectId,
                req.user!,
                {
                    buffer: file.buffer,
                    originalName: file.originalname,
                    mimeType: file.mimetype
                },
                { folder, alt, title, credit, keepLocalCopy, ...generated }
            );

            return void res.status(201).json(asset);
        } catch (err: unknown) {
            return void uploadFailed(res, req, err);
        }
    }
);

const textOf = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * A file from a public address, added like an upload: what an assistant on the hosted MCP server
 * uses, since it has no files of its own here. HTTPS only, never a private network address.
 */
router.post(
    '/import',
    requireProjectAccess,
    uploadAdmission,
    async (req: Request<ProjectParams>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        const { url, name, folder, alt, title, credit } = (req.body ?? {}) as Record<
            string,
            unknown
        >;
        if (typeof url !== 'string' || !url.trim())
            return void res.status(400).json({ error: 'Missing url' });
        let file;
        try {
            file = await downloadPublicFile(url, { maxBytes: uploadMaxMb * 1024 * 1024 });
        } catch (err: unknown) {
            const message = getMessage(err) ?? 'The file could not be downloaded';
            return void res
                .status(message.includes('too large') ? 413 : 422)
                .json({ error: message });
        }
        try {
            const asset = await uploadAsset(
                projectId!,
                req.user!,
                {
                    buffer: file.buffer,
                    originalName: typeof name === 'string' && name.trim() ? name : file.name,
                    mimeType: file.mimeType
                },
                {
                    folder: textOf(folder),
                    alt: textOf(alt),
                    title: textOf(title),
                    credit: textOf(credit)
                }
            );
            return void res.status(201).json(asset);
        } catch (err: unknown) {
            return void uploadFailed(res, req, err);
        }
    }
);

// A new file in an existing asset: same id, so every use shows it.
router.post(
    '/:id/replace',
    requireProjectAccess,
    uploadAdmission,
    upload.single('file'),
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        const file = req.file;
        if (!file) return void res.status(400).json({ error: 'Missing file' });
        try {
            const asset = await replaceAssetFile(projectId, req.user!, id, {
                buffer: file.buffer,
                originalName: file.originalname,
                mimeType: file.mimetype
            });
            return void res.json(asset);
        } catch (err: unknown) {
            if (getMessage(err)?.includes('can only be replaced by'))
                return void res.status(415).json({ error: getMessage(err) });
            return void uploadFailed(res, req, err);
        }
    }
);

router.post(
    '/regenerate',
    requireProjectAdmin,
    async (req: Request<ProjectParams, unknown, RegenerateBody>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
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
            const result = req.body?.background
                ? await queueRegenerateVariants(projectId, req.user!, assetIds)
                : await regenerateVariants(projectId, req.user!, assetIds);
            return void res.json(result);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

// Several assets at once, in one save: to the bin, out of it, to a folder, or their texts.
router.post(
    '/batch',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, BatchBody>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        const { action, ids, folder, changes } = req.body ?? {};
        try {
            if (action === 'bin')
                return void res.json({
                    assets: await binAssets(projectId, req.user!, ids as string[])
                });
            if (action === 'restore')
                return void res.json({
                    assets: await restoreAssets(projectId, req.user!, ids as string[])
                });
            if (action === 'move') {
                if (typeof folder !== 'string')
                    return void res.status(400).json({ error: 'Missing folder' });
                const list = Array.isArray(ids) ? ids : [];
                return void res.json({
                    assets: await updateAssets(
                        projectId,
                        req.user!,
                        list.map(id => ({
                            id: id as string,
                            patch: { folder: folder || null }
                        }))
                    )
                });
            }
            if (action === 'update') {
                if (
                    !Array.isArray(changes) ||
                    changes.some(c => !c || typeof c !== 'object' || typeof c.patch !== 'object')
                )
                    return void res
                        .status(400)
                        .json({ error: 'changes must be a list of { id, patch }' });
                return void res.json({
                    assets: await updateAssets(
                        projectId,
                        req.user!,
                        changes as { id: string; patch: AssetPatch }[]
                    )
                });
            }
            return void res
                .status(400)
                .json({ error: 'action must be one of bin, restore, move, update' });
        } catch (err: unknown) {
            const status = (err as { statusCode?: number })?.statusCode;
            if (!status && /must be|needs/.test(getMessage(err)))
                return void res.status(400).json({ error: getMessage(err) });
            return void sendApiError(res, req, err);
        }
    }
);

router.get(
    '/',
    requireProjectAccess,
    async (req: Request<ProjectParams, unknown, unknown, AssetListQuery>, res: Response) => {
        const { projectId } = req.params as Record<string, string>;
        const { type: typeRaw, folder, search, hash, limit, offset, facets } = req.query;
        if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
        // A page of the library: with `limit`, an object with the page, the total and facets.
        if (limit !== undefined) {
            const n = Number(limit);
            const from = offset === undefined ? 0 : Number(offset);
            if (!Number.isInteger(n) || n < 1 || !Number.isInteger(from) || from < 0)
                return void res
                    .status(400)
                    .json({ error: 'limit and offset must be whole numbers (limit from 1)' });
            const kind =
                typeRaw === 'unused' ? ('unused' as const) : parseOptionalAssetType(typeRaw);
            if (typeRaw && !kind)
                return void res.status(400).json({ error: 'Invalid type filter' });
            try {
                return void res.json(
                    await listAssetPage(projectId, req.user!, {
                        kind,
                        folder,
                        search,
                        limit: n,
                        offset: from,
                        facets: facets === '1' || facets === 'true'
                    })
                );
            } catch (err: unknown) {
                return void sendApiError(res, req, err);
            }
        }
        if (
            typeRaw !== undefined &&
            typeRaw !== '' &&
            parseOptionalAssetType(typeRaw) === undefined
        ) {
            return void res.status(400).json({ error: 'Invalid type filter' });
        }
        const type = parseOptionalAssetType(typeRaw);
        try {
            const assets = await listAssets(projectId, {
                type,
                folder,
                search,
                hash:
                    typeof hash === 'string' && /^[0-9a-f]{64}$/i.test(hash)
                        ? hash.toLowerCase()
                        : undefined
            });
            return void res.json(assets);
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

// How many places use each asset (assets used nowhere are left out).
router.get('/usage', requireProjectAccess, async (req: Request<ProjectParams>, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    if (!projectId) return void res.status(400).json({ error: 'Missing projectId' });
    try {
        const usage = await assetUsage(req.user!, projectId);
        const counts: Record<string, number> = {};
        for (const [id, uses] of usage) counts[id] = uses.length;
        return void res.json({ counts });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

// The bin: deleted assets, restorable until an admin deletes them for good.
router.get('/bin', requireProjectAccess, async (req: Request<ProjectParams>, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json(await listBinnedAssets(projectId, req.user!));
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete('/bin', requireProjectAccess, async (req: Request<ProjectParams>, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    try {
        return void res.json({ deleted: await emptyBin(projectId, req.user!) });
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.delete(
    '/bin/:id',
    requireProjectAccess,
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        try {
            await deleteAssetForever(projectId, req.user!, id);
            return void res.status(204).send();
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.post(
    '/:id/restore',
    requireProjectAccess,
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        try {
            return void res.json(await restoreAsset(projectId, req.user!, id));
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

// A video at a host: ask the host now where it stands, or send it again after a refusal.
router.post(
    '/:id/video/check',
    requireProjectAccess,
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        try {
            return void res.json(await checkVideoStatus(projectId, req.user!, id));
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.post(
    '/:id/video/retry',
    requireProjectAccess,
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        try {
            return void res.json(await retryVideoUpload(projectId, req.user!, id));
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

// Every entry and page field using one asset.
router.get(
    '/:id/usage',
    requireProjectAccess,
    async (req: Request<AssetIdParams>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
        if (!projectId || !id)
            return void res.status(400).json({ error: 'Missing projectId or id' });
        try {
            const usage = await assetUsage(req.user!, projectId);
            return void res.json({ usages: usage.get(id) ?? [] });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

router.get('/:id', requireProjectAccess, async (req: Request<AssetIdParams>, res: Response) => {
    const { projectId, id } = req.params as Record<string, string>;
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
    const { projectId, id } = req.params as Record<string, string>;
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
    const { projectId, id } = req.params as Record<string, string>;
    if (!projectId || !id) return void res.status(400).json({ error: 'Missing projectId or id' });
    try {
        await deleteAsset(projectId, req.user!, id);
        return void res.status(204).send();
    } catch (err: unknown) {
        return void sendApiError(res, req, err);
    }
});

router.post(
    '/:id/move',
    requireProjectAccess,
    async (req: Request<AssetIdParams, unknown, MoveBody>, res: Response) => {
        const { projectId, id } = req.params as Record<string, string>;
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
    '/projects/{projectId}/assets/import': {
        post: {
            summary: 'Add a file from a public address',
            description:
                'Downloads the file and adds it like an upload. HTTPS only; private and restricted network addresses are refused, after each redirect too. Same size limit as uploads.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['url'],
                            properties: {
                                url: { type: 'string', format: 'uri' },
                                name: {
                                    type: 'string',
                                    description: 'File name (default: from the address)'
                                },
                                folder: { type: 'string' },
                                alt: { type: 'string' },
                                title: { type: 'string' },
                                credit: { type: 'string' }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': { description: 'The asset', ...assetJson },
                '413': { description: 'The file is too large' },
                '415': { description: 'A kind of file the project does not allow' },
                '422': { description: 'The address could not be downloaded, or is not allowed' }
            }
        }
    },
    '/projects/{projectId}/assets': {
        get: {
            summary: 'List assets',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'type', in: 'query', schema: { type: 'string' } },
                { name: 'folder', in: 'query', schema: { type: 'string' } },
                {
                    name: 'search',
                    in: 'query',
                    description:
                        'Words in the file name, title, alt text or caption (any language). With `limit`, accents are ignored.',
                    schema: { type: 'string' }
                },
                {
                    name: 'limit',
                    in: 'query',
                    description:
                        'Pages the list (1–500): the answer becomes `{ assets, total, offset, limit, facets? }`, newest first, without files in the bin. `type` may then be `unused`.',
                    schema: { type: 'integer', minimum: 1, maximum: 500 }
                },
                { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
                {
                    name: 'facets',
                    in: 'query',
                    description:
                        'With `limit`: add `facets`, the count of files of each kind (and unused) and the folders in use.',
                    schema: { type: 'boolean' }
                },
                {
                    name: 'hash',
                    in: 'query',
                    description:
                        'SHA-256 of a file (hex): finds the same file already uploaded, including in the bin (those have deletedAt).',
                    schema: { type: 'string' }
                }
            ],
            responses: {
                '200': {
                    description: 'List of assets, or one page of them with `limit`',
                    content: {
                        'application/json': {
                            schema: {
                                oneOf: [
                                    {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/JsonRecord' }
                                    },
                                    {
                                        type: 'object',
                                        properties: {
                                            assets: {
                                                type: 'array',
                                                items: { $ref: '#/components/schemas/JsonRecord' }
                                            },
                                            total: { type: 'integer' },
                                            offset: { type: 'integer' },
                                            limit: { type: 'integer' },
                                            facets: {
                                                type: 'object',
                                                properties: {
                                                    total: { type: 'integer' },
                                                    kinds: {
                                                        type: 'object',
                                                        additionalProperties: { type: 'integer' }
                                                    },
                                                    folders: {
                                                        type: 'array',
                                                        items: { type: 'string' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
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
    '/projects/{projectId}/assets/batch': {
        post: {
            summary: 'Change several assets at once',
            description:
                'One save for the lot, all or nothing: `bin` and `restore` take `ids`; `move` takes `ids` and `folder` (empty for none); `update` takes `changes`, each `{ id, patch }` with the fields PATCH accepts. At most 500 assets.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['action'],
                            properties: {
                                action: {
                                    type: 'string',
                                    enum: ['bin', 'restore', 'move', 'update']
                                },
                                ids: { type: 'array', items: { type: 'string' } },
                                folder: { type: 'string' },
                                changes: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['id', 'patch'],
                                        properties: {
                                            id: { type: 'string' },
                                            patch: { $ref: '#/components/schemas/JsonRecord' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '200': {
                    description: 'The assets as they are now',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    assets: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/JsonRecord' }
                                    }
                                }
                            }
                        }
                    }
                },
                '400': { description: 'A bad action, list or change' },
                '403': { description: 'Not allowed to change these assets' },
                '404': { description: 'An asset is missing (or not in the bin, to restore)' }
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
                            properties: {
                                assetIds: { type: 'array', items: { type: 'string' } },
                                background: {
                                    type: 'boolean',
                                    description:
                                        'Answer at once with `{ queued }` and remake the images in the background'
                                }
                            }
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
    '/projects/{projectId}/assets/usage': {
        get: {
            summary: 'How many places use each asset',
            description:
                'Counts uses in entry and page fields, including images inside rich text. Assets used nowhere are left out.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Uses per asset id',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    counts: {
                                        type: 'object',
                                        additionalProperties: { type: 'integer' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/usage': {
        get: {
            summary: 'Where an asset is used',
            description: 'One line per entry or page field using the asset.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Uses',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    usages: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                kind: { type: 'string', enum: ['entry', 'page'] },
                                                modelId: { type: 'string' },
                                                entryId: { type: 'string' },
                                                pageId: { type: 'string' },
                                                status: { type: 'string' },
                                                title: {
                                                    description:
                                                        'The title as stored: text, or text per language'
                                                },
                                                field: { type: 'string' },
                                                path: { type: 'string' }
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
            summary: 'Move asset to the bin',
            description:
                'The asset leaves the library and reads as missing in content; its files stay until the bin is emptied. Restore it with POST …/restore.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'In the bin' },
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
    '/projects/{projectId}/assets/bin': {
        get: {
            summary: 'Assets in the bin',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Binned assets, most recent first',
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
        delete: {
            summary: 'Empty the bin (admins)',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'How many assets were deleted for good',
                    content: {
                        'application/json': {
                            schema: { type: 'object', properties: { deleted: { type: 'integer' } } }
                        }
                    }
                },
                '403': { description: 'Not an admin' }
            }
        }
    },
    '/projects/{projectId}/assets/bin/{id}': {
        delete: {
            summary: 'Delete an asset in the bin for good (admins)',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '204': { description: 'Deleted for good' },
                '403': { description: 'Not an admin' },
                '404': { description: 'Not in the bin' }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/replace': {
        post: {
            summary: 'Replace the file of an asset, keeping its id',
            description:
                'Same kind of file only (a picture for a picture). Title, alt text, credit, folder and focal point stay; image sizes are made again. Not for videos kept at a video host.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            required: ['file'],
                            properties: { file: { type: 'string', format: 'binary' } }
                        }
                    }
                }
            },
            responses: {
                '200': { description: 'Asset with its new file', ...assetJson },
                '404': { description: 'Not found' },
                '413': { description: 'File too large' },
                '415': { description: 'Not allowed, or not the same kind of file' }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/video/check': {
        post: {
            summary: 'Ask the video host where a video stands',
            description:
                'For hosts that can be asked (`getStatus`); otherwise only webhooks move a video on. The server also asks on its own while a video processes.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': { description: 'The video as it is now', ...assetJson },
                '400': { description: 'Not a video at a host' },
                '404': { description: 'No such asset' }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/video/retry': {
        post: {
            summary: 'Send a refused video to its host again',
            description:
                'From the copy kept on this server. Answers at once with `providerStatus: uploading`.',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': { description: 'The video, on its way again', ...assetJson },
                '404': { description: 'No such asset' },
                '409': { description: 'Not refused by its host, or no copy kept here' }
            }
        }
    },
    '/projects/{projectId}/assets/{id}/restore': {
        post: {
            summary: 'Take an asset out of the bin',
            tags: ['Studio Assets'],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': { description: 'Restored asset', ...assetJson },
                '404': { description: 'Not in the bin' }
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
