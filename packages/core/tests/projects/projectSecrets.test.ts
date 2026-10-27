import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getProjectJson, putProjectJson } from '../../src/utils/projectStorage.js';
import { loadProjects, moveProjectSecretsOutOfGit } from '../../src/projects.js';
import { redactProjectSecrets } from '../../src/assets/mediaSettings.js';

const projectId = 'secrets';
const project = {
    id: projectId,
    label: 'Secrets',
    defaultLocale: 'en',
    assetConfig: {
        adapter: 's3',
        adapterConfig: {
            bucket: 'client-site',
            region: 'ca-central-1',
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'super-secret-key',
            publicUrl: 'https://files.example.com'
        }
    },
    videoProviders: {
        active: 'mux',
        mux: { tokenId: 'mux-id', tokenSecret: 'mux-secret', webhookSecret: 'mux-hook' }
    },
    integrations: { shopify: { shop: 'client.myshopify.com', accessToken: 'shpat_secret' } }
};

describe('credentials stay out of project.json', () => {
    let tempDir: string;
    let dir: string;
    const file = () => path.join(dir, 'project.json');
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-project-secrets-'));
        dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'c'.repeat(64));
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('writes them to the secrets file, sealed, and reads them back', async () => {
        await putProjectJson(projectId, 'project.json', project);
        const onDisk = await fs.readFile(file(), 'utf8');
        for (const secret of [
            'super-secret-key',
            'AKIAEXAMPLE',
            'mux-secret',
            'mux-hook',
            'shpat_secret'
        ])
            expect(onDisk).not.toContain(secret);
        // What isn't secret stays where people can read it in Git.
        expect(onDisk).toContain('ca-central-1');
        expect(onDisk).toContain('https://files.example.com');
        expect(onDisk).toContain('mux-id');

        const sealed = await fs.readFile(path.join(dir, '.moteur', 'secrets.json'), 'utf8');
        expect(sealed).not.toContain('super-secret-key');

        expect(await getProjectJson(projectId, 'project.json')).toEqual(project);
        expect(loadProjects().find(p => p.id === projectId)).toEqual(project);
        // And people still only ever see them as ***.
        const shown = redactProjectSecrets((await getProjectJson(projectId, 'project.json'))!);
        expect(JSON.stringify(shown)).not.toContain('super-secret-key');
    });

    it('drops a secret when its setting goes', async () => {
        await putProjectJson(projectId, 'project.json', project);
        const { assetConfig: _gone, ...rest } = project;
        await putProjectJson(projectId, 'project.json', rest);
        const back = (await getProjectJson<typeof project>(projectId, 'project.json'))!;
        expect(back.assetConfig).toBeUndefined();
        expect(back.videoProviders.mux.tokenSecret).toBe('mux-secret');
        const sealed = await fs.readFile(path.join(dir, '.moteur', 'secrets.json'), 'utf8');
        expect(Object.keys(JSON.parse(sealed).project)).not.toContain(
            'assetConfig.adapterConfig.secretAccessKey'
        );
    });

    it('moves the credentials of a project saved before', async () => {
        await fs.writeFile(file(), JSON.stringify(project));
        expect(await moveProjectSecretsOutOfGit()).toEqual([projectId]);
        expect(await fs.readFile(file(), 'utf8')).not.toContain('super-secret-key');
        expect(await getProjectJson(projectId, 'project.json')).toEqual(project);
        // Once is enough.
        expect(await moveProjectSecretsOutOfGit()).toEqual([]);
    });
});
