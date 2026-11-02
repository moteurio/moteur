import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-usage-alerts-'));
process.env.DATA_ROOT = tmp;
// Credits have an allowance even without a plan (1,000 a month): none here, unless a test sets one.
process.env.MOTEUR_AI_MONTHLY_CREDITS = 'unlimited';

const mail = vi.hoisted(() => ({
    off: false,
    sent: [] as { kind: string; to: string[]; data: any }[]
}));
vi.mock('../src/emailNotifier.js', () => ({
    emailUnavailable: () => (mail.off ? 'No SMTP' : null),
    sendTemplateEmail: async (kind: string, to: string[], data: unknown) => {
        mail.sent.push({ kind, to, data });
    }
}));
const people = vi.hoisted(() => ({
    ada: { id: 'ada', email: 'ada@example.com', isActive: true, roles: [] },
    bill: { id: 'bill', email: 'bill@example.com', isActive: true, roles: [] },
    wes: { id: 'wes', email: 'wes@example.com', isActive: true, roles: [] },
    quiet: {
        id: 'quiet',
        email: 'quiet@example.com',
        isActive: true,
        roles: [],
        preferences: { emails: { usage: false } }
    }
}));
vi.mock('../src/users.js', () => ({ getUserById: (id: string) => (people as any)[id] }));
vi.mock('../src/projects.js', () => ({
    loadProjects: () => [
        {
            id: 'site',
            label: 'Atelier Nord',
            users: ['ada', 'bill', 'wes', 'quiet'],
            memberRoles: { ada: ['admin'], bill: ['billing'], wes: ['writer'], quiet: ['admin'] }
        }
    ]
}));

import {
    createMemoryMeteringStore,
    recordImageTraffic,
    recordRequest,
    setMeteringStore
} from '../src/metering.js';
import {
    setImageTrafficFairUse,
    setImageTrafficQuota,
    setRequestFairUse,
    setRequestQuota
} from '../src/planLimits.js';
import { checkUsageAlerts, levelOf, monthlyUsage } from '../src/usageAlerts.js';
import { renderEmail } from '../src/email/render.js';

const requests = (n: number) => {
    for (let i = 0; i < n; i++) recordRequest('public', 'site');
};
const NOV = new Date('2026-11-15T12:00:00Z');

describe('usage alerts', () => {
    beforeEach(() => {
        setMeteringStore(createMemoryMeteringStore());
        fs.rmSync(path.join(tmp, 'data'), { recursive: true, force: true });
        mail.sent = [];
        mail.off = false;
        setRequestQuota(null);
        setRequestFairUse(null);
        setImageTrafficQuota(null);
        setImageTrafficFairUse(null);
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('counts 80% and all of it, nothing below', () => {
        expect(levelOf(79, 100)).toBeNull();
        expect(levelOf(80, 100)).toBe(80);
        expect(levelOf(100, 100)).toBe(100);
        expect(levelOf(250, 100)).toBe(100);
    });

    it('tells Billing and Admin once at 80%, once at 100%, never again that month', async () => {
        setRequestQuota(() => 100);
        requests(79);
        expect(await checkUsageAlerts(NOV)).toBe(0);
        requests(1);
        expect(await checkUsageAlerts(NOV)).toBe(2);
        expect(mail.sent.map(m => m.to[0]).sort()).toEqual(['ada@example.com', 'bill@example.com']);
        expect(mail.sent[0].data).toMatchObject({
            project: 'Atelier Nord',
            kind: 'requests',
            level: 80,
            used: 80,
            limit: 100,
            fairUse: false,
            resets: '2026-12-01'
        });
        expect(await checkUsageAlerts(NOV)).toBe(0);
        requests(20);
        expect(await checkUsageAlerts(NOV)).toBe(2);
        expect(mail.sent.at(-1)!.data.level).toBe(100);
        requests(500);
        expect(await checkUsageAlerts(NOV)).toBe(0);
        // A new month starts over.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-12-02T00:00:00Z'));
        requests(85);
        expect(await checkUsageAlerts(new Date())).toBe(2);
        vi.useRealTimers();
    });

    it('says a fair use level stops nothing, and sends nothing without limits', async () => {
        expect(monthlyUsage('site')).toEqual([]);
        setImageTrafficFairUse(() => 10 * 1024 ** 3);
        recordImageTraffic('site', 11 * 1024 ** 3);
        expect(await checkUsageAlerts(NOV)).toBe(2);
        expect(mail.sent[0].data).toMatchObject({
            kind: 'imageTraffic',
            level: 100,
            fairUse: true
        });
    });

    it('waits while mail can’t go out, then sends', async () => {
        setRequestQuota(() => 10);
        requests(10);
        mail.off = true;
        expect(await checkUsageAlerts(NOV)).toBe(0);
        mail.off = false;
        expect(await checkUsageAlerts(NOV)).toBe(2);
    });

    it('says what happens, in both languages', () => {
        const base = { project: 'Atelier Nord', used: 20_000, limit: 20_000, resets: '2026-12-01' };
        const quota = renderEmail(
            'usage-alert',
            { ...base, kind: 'requests', level: 100, fairUse: false },
            { locale: 'en' }
        );
        expect(quota.subject).toBe(
            'Atelier Nord has reached its API requests limit for this month'
        );
        expect(quota.text).toContain('its sites get no answer from the API until December 1');
        const fair = renderEmail(
            'usage-alert',
            {
                ...base,
                kind: 'imageTraffic',
                level: 80,
                used: 8.5 * 1024 ** 3,
                limit: 10 * 1024 ** 3,
                fairUse: true
            },
            { locale: 'fr' }
        );
        expect(fair.subject).toBe(
            'Atelier Nord approche du seuil d’usage raisonnable (trafic d’images)'
        );
        expect(fair.text).toContain('Rien ne s’arrête');
        expect(fair.text).toMatch(/8,5\sGo sur 10\sGo/);
    });
});
