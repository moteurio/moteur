import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { initRepo } from '../../src/git/index.js';
import { putProjectJson } from '../../src/utils/projectStorage.js';
import { ASSETS_KEY, modelKey } from '../../src/utils/storageKeys.js';
import { createEntry } from '../../src/entries.js';
import { assetUsage, findAssetRefs } from '../../src/assets/assetUsage.js';

const projectId = 'asset-usage';
const user = { id: 'u1', name: 'Ada', isActive: true, roles: ['admin'], projects: [projectId] };
const COVER = 'mpqaszba-b51krco7';
const INLINE = 'mpqaursq-e6jw2li8';
const UNUSED = 'mpqb0000-unused00';
const asset = (id: string) => ({
    id,
    projectId,
    filename: `${id}.png`,
    mimeType: 'image/png',
    size: 10,
    type: 'image',
    status: 'ready',
    adapter: 'local',
    uploadedBy: 'u1',
    uploadedByName: 'Ada',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    path: `${projectId}/original/${id}.png`
});
const model: ModelSchema = {
    id: 'article',
    label: 'Article',
    fields: {
        title: { type: 'core/text', label: 'Title' },
        cover: { type: 'core/asset', label: 'Cover' },
        body: { type: 'core/textarea', label: 'Body' }
    }
} as ModelSchema;

describe('findAssetRefs', () => {
    const known = new Set([COVER, INLINE]);
    const refs = (value: unknown) => {
        const out: [string, string][] = [];
        findAssetRefs(value, known, (id, p) => out.push([id, p]));
        return out;
    };

    it('finds asset objects and asset URLs, with their paths', () => {
        expect(
            refs({
                cover: { assetId: COVER, alt: { fr: 'Couverture' } },
                blocks: [
                    {
                        type: 'core/image',
                        data: { image: { src: `http://x/static/assets/p/large/${INLINE}.webp` } }
                    }
                ]
            })
        ).toEqual([
            [COVER, 'cover'],
            [INLINE, 'blocks[0].data.image.src']
        ]);
    });

    it('ignores unknown ids and strings that are not asset paths', () => {
        expect(refs({ cover: { assetId: 'gone-asset' }, note: `${COVER} in plain text` })).toEqual(
            []
        );
    });
});

describe('asset usage and metadata', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-asset-usage-'));
        const projDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(projDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'fr', users: ['u1'] })
        );
        await initRepo(projDir);
        await putProjectJson(projectId, modelKey('article'), model);
        await putProjectJson(projectId, ASSETS_KEY, [asset(COVER), asset(INLINE), asset(UNUSED)]);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('lists every entry field using each asset, once per field', async () => {
        await createEntry(user, projectId, 'article', {
            id: 'ungava',
            type: 'article',
            data: {
                title: { fr: 'Sous la glace', en: 'Under the ice' },
                cover: { assetId: COVER },
                body: `<img src="/static/assets/${projectId}/large/${INLINE}.webp"> <img src="/static/assets/${projectId}/thumb/${INLINE}.webp">`
            }
        } as Entry);
        await createEntry(user, projectId, 'article', {
            id: 'paris',
            type: 'article',
            data: { title: 'Paris', cover: { assetId: COVER } }
        } as Entry);

        const usage = await assetUsage(user, projectId);
        expect(
            usage
                .get(COVER)
                ?.map(u => u.kind === 'entry' && u.entryId)
                .sort()
        ).toEqual(['paris', 'ungava']);
        expect(usage.get(INLINE)).toEqual([
            expect.objectContaining({
                kind: 'entry',
                modelId: 'article',
                entryId: 'ungava',
                title: { fr: 'Sous la glace', en: 'Under the ice' },
                field: 'body'
            })
        ]);
        expect(usage.has(UNUSED)).toBe(false);
    });
});
