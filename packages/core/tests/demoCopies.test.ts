import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { demoProjectFor } = await import('../src/onboarding.js');
const { keepDemoCopy, sweepIdleDemoCopies, DEMO_IDLE_DAYS } = await import('../src/demoCopies.js');
const { createKey } = await import('../src/projectApiKey.js');
const { getProjectById } = await import('../src/projects.js');
const { getUserById, reloadUsers } = await import('../src/users.js');
const { onEvent } = await import('../src/utils/eventBus.js');
const limits = await import('../src/planLimits.js');
const { gitIdle } = await import('../src/git/gitService.js');

const ADA = 'user:ada0000000';

describe('a demo copy: for trying things, until its person keeps it', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-demo-copies-'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DEMO_PROJECT_ID', 'demo');
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                { id: ADA, email: 'ada@dev.test', isActive: true, roles: [], projects: [] }
            ])
        );
        reloadUsers();
        const demo = path.join(root, 'data', 'projects', 'demo');
        fs.mkdirSync(path.join(demo, 'models', 'article'), { recursive: true });
        fs.writeFileSync(
            path.join(demo, 'project.json'),
            JSON.stringify({ id: 'demo', label: 'Moteur Journal', defaultLocale: 'en', users: [] })
        );
        fs.writeFileSync(
            path.join(demo, 'models', 'article', 'model.json'),
            JSON.stringify({ id: 'article', label: 'Article' })
        );
        limits.setCountLimit(() => 5);
        limits.setStorageLimit(() => 100);
        limits.setPeopleLimit(() => 1);
    });
    afterEach(async () => {
        await gitIdle();
        limits.setCountLimit(null);
        limits.setStorageLimit(null);
        limits.setPeopleLimit(null);
        limits.setProjectsLimit(null);
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const ada = () => getUserById(ADA)!;

    it('is marked as a copy of the demo', async () => {
        const id = await demoProjectFor(ADA);
        const project = await getProjectById(id);
        expect(project?.demo).toEqual({ from: 'demo', copiedAt: expect.any(String) });
    });

    it('serves no site: no API keys', async () => {
        const id = await demoProjectFor(ADA);
        await expect(createKey(id, ada(), { label: 'Site' })).rejects.toMatchObject({
            status: 409,
            code: 'DEMO_COPY'
        });
    });

    it('is announced, so a host can give it a plan to try everything on', async () => {
        const copied: string[] = [];
        onEvent('project.demoCopied', ({ project, user }) => {
            copied.push(`${project.id} by ${user.id}, demo from ${project.demo?.from}`);
        });
        const id = await demoProjectFor(ADA);
        expect(copied).toEqual([`${id} by ${ADA}, demo from demo`]);
    });

    it('kept, becomes their project: counted on their plan, and API keys allowed', async () => {
        const id = await demoProjectFor(ADA);
        const created: string[] = [];
        onEvent('project.afterCreate', ({ project, user }) => {
            if (project.id === id) created.push(`${project.id} by ${user.id}`);
        });
        const kept = await keepDemoCopy(ada(), id);
        expect(kept.demo).toBeUndefined();
        expect((await getProjectById(id))?.demo).toBeUndefined();
        expect(created).toEqual([`${id} by ${ADA}`]);
        // No longer their demo: they may be offered another.
        expect(getUserById(ADA)?.onboarding?.demoProjectId).toBeUndefined();
        await expect(createKey(id, ada(), { label: 'Site' })).resolves.toMatchObject({
            prefix: expect.any(String)
        });
        await expect(keepDemoCopy(ada(), id)).rejects.toMatchObject({ code: 'NOT_DEMO_COPY' });
    });

    it('is kept only within how many projects they may start', async () => {
        const id = await demoProjectFor(ADA);
        limits.setProjectsLimit(() => ({ taken: 1, max: 1 }));
        await expect(keepDemoCopy(ada(), id)).rejects.toMatchObject({
            code: 'plan_limit',
            status: 402
        });
        expect((await getProjectById(id))?.demo).toBeTruthy();
    });

    it(`goes to the trash after ${DEMO_IDLE_DAYS} days without a change; a kept one stays`, async () => {
        const id = await demoProjectFor(ADA);
        await gitIdle();
        const soon = Date.now() + (DEMO_IDLE_DAYS - 1) * 86_400_000;
        expect(await sweepIdleDemoCopies(soon)).toEqual([]);
        const later = Date.now() + (DEMO_IDLE_DAYS + 1) * 86_400_000;
        expect(await sweepIdleDemoCopies(later)).toEqual([id]);
        expect(await getProjectById(id)).toBeFalsy();
        expect(fs.existsSync(path.join(root, 'data', 'projects', '.trash', 'projects', id))).toBe(
            true
        );

        reloadUsers();
        const again = await demoProjectFor(ADA).catch(() => null);
        if (again) {
            await keepDemoCopy(ada(), again);
            expect(await sweepIdleDemoCopies(later)).toEqual([]);
        }
    });
});
