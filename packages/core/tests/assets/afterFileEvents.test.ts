import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { replaceAssetFile, updateAsset, uploadAsset } from '../../src/assets/assetService.js';
import { onEvent } from '../../src/utils/eventBus.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'media-events';
const user = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

const pdf = (text: string) => ({
    buffer: Buffer.from(`%PDF-1.4 ${text}`),
    originalName: `${text}.pdf`,
    mimeType: 'application/pdf'
});

// The event bus keeps its listeners: each test says what this one does.
let listener: (event: string, payload: Record<string, unknown>) => Promise<void> = async () => {};
onEvent('asset.afterCreate', p => listener('asset.afterCreate', p));
onEvent('asset.afterReplace', p => listener('asset.afterReplace', p));

describe('plugins hear about new files', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-media-events-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        await initRepo(dir);
    });
    afterEach(async () => {
        listener = async () => {};
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('on every upload and replace, and the asset returned has what they changed', async () => {
        const heard: string[] = [];
        listener = async (event, p) => {
            heard.push(`${event} ${String(p.uploadAlt ?? '')}`);
            const asset = p.asset as { id: string };
            await updateAsset(projectId, user, asset.id, { caption: `after ${event}` });
        };
        const a = await uploadAsset(projectId, user, pdf('menu'), { alt: 'The menu' });
        expect(a.caption).toBe('after asset.afterCreate');
        const b = await replaceAssetFile(projectId, user, a.id, pdf('menu-2'));
        expect(b.caption).toBe('after asset.afterReplace');
        expect(heard).toEqual(['asset.afterCreate The menu', 'asset.afterReplace ']);
    });

    it('keeps the file when a plugin fails', async () => {
        listener = async () => {
            throw new Error('no provider');
        };
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = await uploadAsset(projectId, user, pdf('poster'));
        expect(a.id).toBeTruthy();
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
