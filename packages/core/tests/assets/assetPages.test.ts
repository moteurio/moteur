import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import {
    binAssets,
    listAssetPage,
    listAssets,
    updateAssets,
    uploadAsset
} from '../../src/assets/assetService.js';
import { resetAssetIndex } from '../../src/assets/assetIndex.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'media-pages';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

const pdf = (name: string) => ({
    buffer: Buffer.from(`%PDF-1.4 ${name}`),
    originalName: name,
    mimeType: 'application/pdf'
});

describe.each(['sqlite', 'files'])('library pages (index: %s)', mode => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-media-pages-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('MOTEUR_CONTENT_INDEX', mode);
        await resetAssetIndex();
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'fr',
                users: ['u1'],
                assetConfig: { variants: [] }
            })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        await resetAssetIndex();
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('pages newest first, filters on the server and counts the tabs', async () => {
        const ids: string[] = [];
        for (const name of ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']) {
            ids.push((await uploadAsset(projectId, admin, pdf(name))).id);
            await new Promise(r => setTimeout(r, 5));
        }
        await updateAssets(projectId, admin, [
            { id: ids[0], patch: { folder: 'Menus', title: { fr: 'Carte de la Gaspésie' } } },
            { id: ids[1], patch: { folder: 'Menus' } }
        ]);
        await binAssets(projectId, admin, [ids[4]]);

        const first = await listAssetPage(projectId, admin, { limit: 2, facets: true });
        expect(first.total).toBe(4);
        expect(first.assets.map(a => a.filename)).toEqual(['d.pdf', 'c.pdf']);
        expect(first.facets).toEqual({
            total: 4,
            kinds: { image: 0, video: 0, audio: 0, model: 0, document: 4, unused: 4 },
            folders: ['Menus']
        });
        const second = await listAssetPage(projectId, admin, { limit: 2, offset: 2 });
        expect(second.assets.map(a => a.filename)).toEqual(['b.pdf', 'a.pdf']);
        expect(second.facets).toBeUndefined();

        const found = await listAssetPage(projectId, admin, { search: 'GASPESIE' });
        expect(found.assets.map(a => a.id)).toEqual([ids[0]]);
        expect((await listAssetPage(projectId, admin, { folder: '' })).total).toBe(2);
        expect((await listAssetPage(projectId, admin, { folder: 'Menus' })).total).toBe(2);
        expect((await listAssetPage(projectId, admin, { kind: 'image' })).total).toBe(0);
        expect((await listAssetPage(projectId, admin, { kind: 'unused' })).total).toBe(4);
        expect((await listAssetPage(projectId, admin, { limit: 9999 })).limit).toBe(500);
    });

    it('follows assets.json changed outside the server, and takes search words literally', async () => {
        // Names lose their % on upload; titles keep it.
        const a = await uploadAsset(projectId, admin, pdf('tarifs.pdf'), { title: 'Remise 100%' });
        await uploadAsset(projectId, admin, pdf('tarifs-b.pdf'), { title: 'Remise 1000 $' });
        expect(
            (await listAssetPage(projectId, admin, { search: '100%' })).assets.map(x => x.id)
        ).toEqual([a.id]);
        expect((await listAssetPage(projectId, admin, { search: '_' })).total).toBe(0);

        // As after a git pull: the file changes underneath.
        const file = path.join(tempDir, 'data', 'projects', projectId, 'assets.json');
        const list = JSON.parse(await fs.readFile(file, 'utf8'));
        list[0].folder = 'Archives';
        list.pop();
        await fs.writeFile(file, JSON.stringify(list));
        const after = await listAssetPage(projectId, admin, { facets: true });
        expect(after.total).toBe(1);
        expect(after.facets?.folders).toEqual(['Archives']);

        // The index is only a copy: deleting it loses nothing.
        await fs.rm(path.join(tempDir, 'data', 'projects', projectId, '.moteur', 'cache'), {
            recursive: true,
            force: true
        });
        expect((await listAssetPage(projectId, admin, { folder: 'Archives' })).total).toBe(1);
    });

    it('finds the same file by fingerprint, in the bin too', async () => {
        const a = await uploadAsset(projectId, admin, pdf('a.pdf'));
        await binAssets(projectId, admin, [a.id]);
        const found = await listAssets(projectId, { hash: a.hash });
        expect(found.map(x => [x.id, Boolean(x.deletedAt)])).toEqual([[a.id, true]]);
    });
});
