import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-server-news-'));
process.env.DATA_ROOT = tmp;
process.env.OPERATORS_FILE = path.join(tmp, 'operators.json');
process.env.JWT_SECRET = 'test-secret-for-server-news';
process.env.STUDIO_URL = 'https://studio.example.com';

const mail = vi.hoisted(() => ({
    off: false,
    fail: false,
    sent: [] as { kind: string; to: string[]; data: any }[]
}));
vi.mock('../src/emailNotifier.js', () => ({
    emailUnavailable: () => (mail.off ? 'No SMTP' : null),
    sendTemplateEmail: async (kind: string, to: string[], data: unknown) => {
        if (mail.fail) throw new Error('refused');
        mail.sent.push({ kind, to, data });
    }
}));
const people = vi.hoisted(() => ({
    louise: { id: 'louise', email: 'louise@agence.example', name: 'Louise', isActive: true },
    marc: { id: 'marc', email: 'marc@client.example', isActive: true }
}));
vi.mock('../src/users.js', () => ({ getUserById: (id: string) => (people as any)[id] }));
vi.mock('../src/projects.js', () => ({
    getDemoProjectId: () => 'demo',
    loadProject: (id: string) => (id === 'journal' ? { id, label: 'Journal' } : null)
}));
vi.mock('../src/workspaces.js', () => ({
    getWorkspace: (id: string) => (id === 'ws-team' ? { id, name: 'Agence Nord' } : undefined),
    workspaceOf: (p: { workspaceId?: string }) =>
        p.workspaceId === 'ws-own'
            ? { id: 'ws-own', name: 'Louise', personal: { userId: 'louise' } }
            : p.workspaceId === 'ws-team'
              ? { id: 'ws-team', name: 'Agence Nord' }
              : undefined
}));

import {
    addOperator,
    completeEnrollment,
    listOperators,
    setOperatorNews,
    startEnrollment
} from '../src/operators.js';
import { totpCode, totpStep } from '../src/totp.js';
import { privateStatePath } from '../src/utils/privateStore.js';
import {
    listServerNews,
    listenForServerNews,
    recordServerNews,
    sendServerNews,
    stopServerNews
} from '../src/serverNews.js';
import { triggerEvent } from '../src/utils/eventBus.js';
import { renderEmail } from '../src/email/render.js';

const newsFile = () => privateStatePath('server-news.json');

async function enrolledOperator(email: string) {
    const { token } = addOperator({ email });
    const { secret } = startEnrollment(token);
    await completeEnrollment(token, {
        password: 'a long operator password',
        code: totpCode(secret, totpStep(Date.now()))
    });
    return listOperators().find(o => o.email === email)!;
}

const louise = people.louise as any;

beforeEach(() => {
    mail.off = false;
    mail.fail = false;
    mail.sent = [];
    fs.rmSync(process.env.OPERATORS_FILE!, { force: true });
    fs.rmSync(newsFile(), { force: true });
});
afterAll(() => {
    stopServerNews();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('what is news', () => {
    listenForServerNews();

    it('keeps new accounts with how they came and who invited them', async () => {
        await triggerEvent('user.afterCreate', {
            user: {
                ...people.marc,
                roles: [],
                projects: [],
                signup: {
                    at: '2026-11-07T10:00:00Z',
                    method: 'invite',
                    invite: { by: 'louise', projectId: 'journal' }
                }
            } as any
        });
        await triggerEvent('user.afterCreate', {
            user: {
                id: 'sam',
                email: 'sam@studio.example',
                isActive: true,
                roles: [],
                projects: [],
                auth: { github: '42' },
                signup: { at: '2026-11-07T10:00:00Z', method: 'provider', from: '/for/agencies' }
            }
        });
        const [marc, sam] = listServerNews();
        expect(marc).toMatchObject({
            kind: 'account',
            email: 'marc@client.example',
            method: 'invite',
            invitedBy: 'Louise',
            invitedTo: 'Journal'
        });
        expect(sam).toMatchObject({
            method: 'provider',
            provider: 'github',
            from: '/for/agencies'
        });
    });

    it('keeps projects with their workspace, but not the demo or copies of it', async () => {
        const p = (x: object) => ({ id: 'p', label: 'P', ...x }) as any;
        await triggerEvent('project.afterCreate', { project: p({ id: 'demo' }), user: louise });
        await triggerEvent('project.afterCreate', {
            project: p({ id: 'demo-louise', demo: { from: 'demo', copiedAt: 'x' } }),
            user: louise
        });
        await triggerEvent('project.afterCreate', {
            project: p({ id: 'blog', label: 'Blog', workspaceId: 'ws-own' }),
            user: louise
        });
        await triggerEvent('project.afterCreate', {
            project: p({ id: 'journal', label: 'Journal', workspaceId: 'ws-team' }),
            user: louise
        });
        expect(listServerNews()).toMatchObject([
            { kind: 'project', label: 'Blog', by: 'Louise', personal: true },
            { kind: 'project', label: 'Journal', workspace: 'Agence Nord' }
        ]);
    });

    it('keeps team workspaces, not personal ones, and deleted accounts', async () => {
        const ws = { members: {}, createdAt: 'x', createdBy: 'louise' };
        await triggerEvent('workspace.afterCreate', {
            workspace: { ...ws, id: 'a', name: 'Louise', personal: { userId: 'louise' } },
            user: louise
        });
        await triggerEvent('workspace.afterCreate', {
            workspace: { ...ws, id: 'b', name: 'Agence Nord' },
            user: louise
        });
        await triggerEvent('auth.account.deleted', {
            userId: 'marc',
            email: 'marc@client.example'
        });
        expect(listServerNews()).toMatchObject([
            { kind: 'workspace', name: 'Agence Nord', by: 'Louise' },
            { kind: 'account-deleted', email: 'marc@client.example' }
        ]);
    });

    it('forgets what is older than 90 days', () => {
        recordServerNews(
            { kind: 'account-deleted', userId: 'a', email: 'a@x' },
            new Date('2026-01-01')
        );
        recordServerNews(
            { kind: 'account-deleted', userId: 'b', email: 'b@x' },
            new Date('2026-11-01')
        );
        expect(listServerNews().map(i => i.userId)).toEqual(['b']);
        expect(listServerNews('2026-11-02T00:00:00Z')).toEqual([]);
    });
});

describe('emails to operators', () => {
    const news = (email: string, at: Date) =>
        recordServerNews({ kind: 'account-deleted', userId: email, email }, at);

    it('each one: what came since the last email, once', async () => {
        const op = await enrolledOperator('ops@example.com');
        news('a@x', new Date(Date.now() + 1000));
        news('b@x', new Date(Date.now() + 2000));
        const later = new Date(Date.now() + 5000);
        expect(await sendServerNews(later)).toBe(1);
        expect(mail.sent[0]).toMatchObject({
            kind: 'server-news',
            to: [op.email],
            data: { daily: false, more: 0, url: 'https://studio.example.com/operator' }
        });
        expect(mail.sent[0].data.items.map((i: any) => i.email)).toEqual(['a@x', 'b@x']);
        expect(await sendServerNews(later)).toBe(0);
    });

    it('nothing while mail is down or failing; it goes once it can', async () => {
        await enrolledOperator('ops@example.com');
        news('a@x', new Date(Date.now() + 1000));
        const later = new Date(Date.now() + 5000);
        mail.off = true;
        expect(await sendServerNews(later)).toBe(0);
        mail.off = false;
        mail.fail = true;
        expect(await sendServerNews(later)).toBe(0);
        mail.fail = false;
        expect(await sendServerNews(later)).toBe(1);
    });

    it('daily: one summary a day, only when something happened', async () => {
        const op = await enrolledOperator('ops@example.com');
        setOperatorNews(op.id, 'daily');
        const start = Date.now();
        news('a@x', new Date(start + 1000));
        expect(await sendServerNews(new Date(start + 3600_000))).toBe(0);
        expect(await sendServerNews(new Date(start + 25 * 3600_000))).toBe(1);
        expect(mail.sent[0].data.daily).toBe(true);
        // A quiet day: no email.
        expect(await sendServerNews(new Date(start + 50 * 3600_000))).toBe(0);
    });

    it('off: nothing; and nothing from before the choice', async () => {
        const op = await enrolledOperator('ops@example.com');
        setOperatorNews(op.id, 'off');
        await new Promise(r => setTimeout(r, 5));
        news('a@x', new Date());
        expect(await sendServerNews()).toBe(0);
        await new Promise(r => setTimeout(r, 5));
        setOperatorNews(op.id, 'each');
        expect(await sendServerNews()).toBe(0);
    });

    it('operators who never finished their link get nothing', async () => {
        addOperator({ email: 'new@example.com' });
        news('a@x', new Date(Date.now() + 1000));
        expect(await sendServerNews(new Date(Date.now() + 5000))).toBe(0);
    });
});

describe('the email', () => {
    it('one item: its own subject', () => {
        const email = renderEmail(
            'server-news',
            {
                daily: false,
                more: 0,
                items: [
                    { kind: 'project', label: 'Journal', by: 'Louise', workspace: 'Agence Nord' }
                ]
            },
            { locale: 'fr' }
        );
        expect(email.subject).toBe('Nouveau projet\u202f: Journal');
        expect(email.text).toContain('par Louise, dans Agence Nord');
    });

    it('many: counted in the subject, with what did not fit', () => {
        const email = renderEmail('server-news', {
            daily: false,
            more: 3,
            items: [
                { kind: 'account', email: 'a@x', method: 'email' },
                { kind: 'account', email: 'b@x', method: 'added' }
            ]
        });
        expect(email.subject).toMatch(/New on .+: 2 accounts, 3 more$/);
        expect(email.text).toContain('added by the server');
        expect(email.text).toContain('And 3 more on the Operator screen.');
    });
});
