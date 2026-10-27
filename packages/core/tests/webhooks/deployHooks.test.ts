import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    createWebhook,
    dispatch,
    getDeliveryLog,
    stopWebhookWorker,
    updateWebhook
} from '../../src/webhooks/webhookService.js';

vi.mock('../../src/webhooks/outboundHttp.js', () => ({ postWebhook: vi.fn() }));
vi.mock('node:dns/promises', () => ({
    default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }
}));

const projectId = 'deploy-hooks';
const publish = (entryId: string) =>
    dispatch(
        'entry.published',
        { entryId, modelId: 'article', status: 'published', updatedBy: 'u1' },
        { projectId, source: 'api' }
    );

describe('deploy hooks', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-deploy-hooks-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'a'.repeat(64));
    });
    afterEach(async () => {
        stopWebhookWorker();
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('listens to what goes live, not to every note or letter', async () => {
        const hook = await createWebhook(projectId, 'u1', {
            name: 'Vercel',
            url: 'https://api.vercel.com/v1/integrations/deploy/prj_1/abc',
            kind: 'deploy'
        });
        expect(hook).toMatchObject({ kind: 'deploy', batchSeconds: 30 });
        expect(hook.events).toEqual(
            expect.arrayContaining(['entry.published', 'page.updated', 'navigation.updated'])
        );
        expect(hook.events).not.toContain('form.submitted');
        await expect(
            createWebhook(projectId, 'u1', {
                name: 'X',
                url: 'https://example.com/x',
                kind: 'deploy',
                batchSeconds: 601
            })
        ).rejects.toThrow('batchSeconds');
    });

    it('starts one build for changes close together', async () => {
        const deploy = await createWebhook(projectId, 'u1', {
            name: 'Netlify',
            url: 'https://api.netlify.com/build_hooks/abc',
            kind: 'deploy',
            batchSeconds: 60
        });
        const plain = await createWebhook(projectId, 'u1', {
            name: 'Slack',
            url: 'https://hooks.example.com/x',
            events: ['entry.published']
        });
        const before = Date.now();
        await publish('a');
        await publish('b');
        await publish('c');
        await dispatch(
            'form.submitted',
            { formId: 'f', formHandle: 'f', submissionId: 's', fields: {} },
            { projectId, source: 'api' }
        );

        const builds = await getDeliveryLog(projectId, deploy.id);
        expect(builds).toHaveLength(1);
        expect(Date.parse(builds[0].nextRetryAt!)).toBeGreaterThanOrEqual(before + 59_000);
        // An ordinary webhook still gets every event.
        expect(await getDeliveryLog(projectId, plain.id)).toHaveLength(3);
    });

    it('turns an ordinary webhook into a deploy hook', async () => {
        const hook = await createWebhook(projectId, 'u1', {
            name: 'Hook',
            url: 'https://example.com/hook'
        });
        const updated = await updateWebhook(projectId, 'u1', hook.id, {
            kind: 'deploy',
            batchSeconds: 0
        });
        expect(updated).toMatchObject({ kind: 'deploy', batchSeconds: 0 });
        await expect(
            updateWebhook(projectId, 'u1', hook.id, { kind: 'cron' as never })
        ).rejects.toThrow('kind');
    });
});
