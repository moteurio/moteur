import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projects = vi.hoisted(() => ({
    existing: new Set<string>(['demo']),
    copies: [] as string[][]
}));
vi.mock('../src/projects.js', () => ({
    getDemoProjectId: () => 'demo',
    copyProjectForNewUser: async (from: string, to: string, user: string) => {
        projects.copies.push([from, to, user]);
        projects.existing.add(to);
    }
}));
vi.mock('../src/utils/fileUtils.js', () => ({
    isExistingProjectId: (id: string) => projects.existing.has(id)
}));
const mail = vi.hoisted(() => ({ sent: [] as { subject: string; text: string }[] }));
vi.mock('../src/emailNotifier.js', () => ({
    emailUnavailable: () => null,
    sendEmail: async (m: { subject: string; text: string }) => void mail.sent.push(m)
}));

const { updateOnboarding, demoProjectFor, sendWelcome } = await import('../src/onboarding.js');
const { getUserById, reloadUsers } = await import('../src/users.js');

describe('a new person’s first minutes', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-onboarding-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DEMO_PROJECT_ID', 'demo');
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                {
                    id: 'user:abcd1234ef',
                    email: 'theo@agency.test',
                    name: 'Théo Nadeau',
                    isActive: true,
                    roles: [],
                    projects: []
                }
            ])
        );
        reloadUsers();
        projects.copies.length = 0;
        projects.existing = new Set(['demo']);
        mail.sent.length = 0;
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('keeps what they came for, and when they finished', async () => {
        const state = await updateOnboarding('user:abcd1234ef', { intent: 'agency' });
        expect(state).toEqual({ intent: 'agency' });
        await updateOnboarding('user:abcd1234ef', { finished: true, name: '  Théo N.  ' });
        expect(getUserById('user:abcd1234ef')?.name).toBe('Théo N.');
        expect(getUserById('user:abcd1234ef')?.onboarding).toMatchObject({
            intent: 'agency',
            finishedAt: expect.any(String)
        });
        await expect(updateOnboarding('user:abcd1234ef', { intent: 'spy' })).rejects.toMatchObject({
            status: 400
        });
    });

    it('copies the demo once, when they ask, and gives the same copy back', async () => {
        const id = await demoProjectFor('user:abcd1234ef');
        expect(id).toBe('demo-abcd1234');
        expect(await demoProjectFor('user:abcd1234ef')).toBe(id);
        expect(projects.copies).toEqual([['demo', 'demo-abcd1234', 'user:abcd1234ef']]);
    });

    it('says so when the server has no demo', async () => {
        projects.existing.delete('demo');
        await expect(demoProjectFor('user:abcd1234ef')).rejects.toMatchObject({ code: 'NO_DEMO' });
    });

    it('makes one copy when asked twice at once, and three at most', async () => {
        const [a, b] = await Promise.all([
            demoProjectFor('user:abcd1234ef'),
            demoProjectFor('user:abcd1234ef')
        ]);
        expect(a).toBe(b);
        expect(projects.copies).toHaveLength(1);
        for (let i = 0; i < 2; i++) {
            projects.existing.delete(getUserById('user:abcd1234ef')!.onboarding!.demoProjectId!);
            await demoProjectFor('user:abcd1234ef');
        }
        projects.existing.delete(getUserById('user:abcd1234ef')!.onboarding!.demoProjectId!);
        await expect(demoProjectFor('user:abcd1234ef')).rejects.toMatchObject({
            code: 'DEMO_LIMIT'
        });
        expect(projects.copies).toHaveLength(3);
    });

    it('copies nothing unless the server names its demo', async () => {
        vi.stubEnv('DEMO_PROJECT_ID', '');
        await expect(demoProjectFor('user:abcd1234ef')).rejects.toMatchObject({ code: 'NO_DEMO' });
        expect(projects.copies).toEqual([]);
    });

    it('welcomes them by first name, with the Studio’s links when it knows them', async () => {
        vi.stubEnv('STUDIO_URL', 'https://studio.moteur.io/');
        await sendWelcome(getUserById('user:abcd1234ef')!);
        expect(mail.sent[0].subject).toBe('Welcome to Moteur');
        expect(mail.sent[0].text).toMatch(/^Hi Théo,/);
        expect(mail.sent[0].text).toContain('https://studio.moteur.io/projects/new');
        expect(mail.sent[0].text).not.toContain('!');
    });
});
