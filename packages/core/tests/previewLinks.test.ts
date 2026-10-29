import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createPreviewToken, verifyPreviewToken } from '../src/previewTokens.js';
import type { User } from '@moteurio/types/User.js';

const person = (id: string) =>
    ({
        id,
        name: id,
        email: `${id}@x.dev`,
        isActive: true,
        roles: ['writer'],
        projects: []
    }) as User;
const ada = person('ada');
const bob = person('bob');

describe('preview links', () => {
    let tempDir: string;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-preview-links-'));
        vi.stubEnv('DATA_ROOT', tempDir);
        const dir = path.join(tempDir, 'data', 'projects', 'site');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: 'site',
                label: 'Site',
                defaultLocale: 'en',
                users: ['ada', 'bob']
            })
        );
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('end a busy person’s own oldest link, never a colleague’s', async () => {
        const bobs = await createPreviewToken('site', bob, { pageId: 'home' });
        const adas = [];
        for (let i = 0; i < 51; i++)
            adas.push(await createPreviewToken('site', ada, { pageId: 'home' }));

        expect((await verifyPreviewToken('site', bobs.rawToken)).ok).toBe(true);
        expect((await verifyPreviewToken('site', adas[0]!.rawToken)).ok).toBe(false);
        expect((await verifyPreviewToken('site', adas[1]!.rawToken)).ok).toBe(true);
        expect((await verifyPreviewToken('site', adas[50]!.rawToken)).ok).toBe(true);
    });
});
