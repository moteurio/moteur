/**
 * Emails a project's Billing and Admin people when the month's usage reaches 80% and then all of
 * an allowance: API requests, image traffic, AI credits and form submissions. Against a limit it
 * says what stops and when the count starts again; against a fair use level, that nothing stops.
 * Once per project, allowance and level each month: what was sent is kept, so a restart doesn't
 * send it again. Only allowances that exist count: without a plan, that's the AI credits'
 * monthly allowance (MOTEUR_AI_MONTHLY_CREDITS), unless it's unlimited.
 */
import { isInProject, rolesInProject } from '@moteurio/types';
import { workspaceOf } from './workspaces.js';
import type { User } from '@moteurio/types/User.js';
import { emailUnavailable, sendTemplateEmail } from './emailNotifier.js';
import { readerOf } from './email/render.js';
import { unsubscribeUrl, wantsEmail } from './email/unsubscribe.js';
import {
    creditBalance,
    currentPeriod,
    imageTraffic,
    publicRequestCount,
    submissionCount
} from './metering.js';
import {
    getImageTrafficFairUse,
    getImageTrafficQuota,
    getRequestFairUse,
    getRequestQuota,
    getSubmissionQuota
} from './planLimits.js';
import { loadProjects } from './projects.js';
import { getUserById } from './users.js';
import { readPrivateState, privateStatePath, writePrivateState } from './utils/privateStore.js';
import { studioUrl } from './utils/studioUrl.js';

export type UsageKind = 'requests' | 'imageTraffic' | 'aiCredits' | 'submissions';
export type UsageLevel = 80 | 100;

/** One allowance this month: how much is used, against what, and whether it stops anything. */
export type MonthlyUsage = { kind: UsageKind; used: number; limit: number; fairUse: boolean };

type State = { period: string; sent: Record<string, Partial<Record<UsageKind, UsageLevel>>> };

const file = () => privateStatePath('usage-alerts.json');

/** The project's allowances this month that have a limit or a fair use level. */
export function monthlyUsage(projectId: string, period = currentPeriod()): MonthlyUsage[] {
    const out: MonthlyUsage[] = [];
    const add = (kind: UsageKind, used: number, quota: number | null, fair: number | null) => {
        const limit = quota ?? fair;
        if (limit != null && limit > 0) out.push({ kind, used, limit, fairUse: quota == null });
    };
    add(
        'requests',
        publicRequestCount(projectId, period),
        getRequestQuota(projectId),
        getRequestFairUse(projectId)
    );
    add(
        'imageTraffic',
        imageTraffic(projectId, period).bytes,
        getImageTrafficQuota(projectId),
        getImageTrafficFairUse(projectId)
    );
    const credits = creditBalance(projectId, period);
    if (credits.allowance != null) add('aiCredits', credits.used, credits.allowance, null);
    add('submissions', submissionCount(projectId, period), getSubmissionQuota(projectId), null);
    return out;
}

/** 100 once all of it is used, 80 from four fifths, else null. */
export function levelOf(used: number, limit: number): UsageLevel | null {
    if (used >= limit) return 100;
    if (used >= limit * 0.8) return 80;
    return null;
}

/** The first day of the month after `period` (`2026-11` → `2026-12-01`). */
function nextMonth(period: string): string {
    const [y, m] = period.split('-').map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * Who hears about a project's usage: the people in it (its workspace's owners and billing among
 * them) with Billing or Admin there, who want these emails.
 */
function recipients(project: { id: string; users?: string[]; workspaceId?: string }): User[] {
    const workspace = workspaceOf(project);
    const ids = new Set([...(project.users ?? []), ...Object.keys(workspace?.members ?? {})]);
    return [...ids]
        .filter(id => isInProject(id, project, workspace))
        .map(id => getUserById(id))
        .filter((u): u is User => !!u?.email && u.isActive !== false)
        .filter(u => {
            const roles = rolesInProject(u, project as never, workspace);
            return roles.includes('billing') || roles.includes('admin');
        })
        .filter(u => wantsEmail(u, 'usage'));
}

/**
 * Looks at every project's month and sends what's due. Returns the emails sent. Nothing is
 * recorded while mail can't go out, so the alert goes once it can.
 */
export async function checkUsageAlerts(now = new Date()): Promise<number> {
    if (emailUnavailable()) return 0;
    const period = currentPeriod(now);
    const kept = readPrivateState<State>(file(), { period, sent: {} });
    const state: State = kept.period === period ? kept : { period, sent: {} };
    const studio = studioUrl();
    let sent = 0;
    let changed = kept.period !== period;
    for (const project of loadProjects()) {
        for (const usage of monthlyUsage(project.id, period)) {
            const level = levelOf(usage.used, usage.limit);
            const before = state.sent[project.id]?.[usage.kind];
            if (!level || (before && before >= level)) continue;
            for (const user of recipients(project)) {
                try {
                    await sendTemplateEmail(
                        'usage-alert',
                        [user.email],
                        {
                            project: project.label || project.id,
                            kind: usage.kind,
                            level,
                            used: usage.used,
                            limit: usage.limit,
                            fairUse: usage.fairUse,
                            resets: nextMonth(period),
                            ...(studio && {
                                url: `${studio}/projects/${encodeURIComponent(project.id)}/setup/billing`
                            }),
                            unsubscribeUrl: unsubscribeUrl(user.id, 'usage')
                        },
                        readerOf(user)
                    );
                    sent++;
                } catch (err) {
                    console.error(
                        `[moteur] A usage email for ${project.id} could not be sent:`,
                        err instanceof Error ? err.message : err
                    );
                }
            }
            state.sent[project.id] = { ...state.sent[project.id], [usage.kind]: level };
            changed = true;
        }
    }
    if (changed) writePrivateState(file(), state);
    return sent;
}

let timer: ReturnType<typeof globalThis.setInterval> | undefined;

/** Checks every `intervalMs` (15 minutes by default) until stopped. */
export function startUsageAlerts(intervalMs = 15 * 60_000): void {
    stopUsageAlerts();
    const run = () =>
        void checkUsageAlerts().catch(err =>
            console.error('[moteur] Usage alerts failed:', err instanceof Error ? err.message : err)
        );
    timer = globalThis.setInterval(run, intervalMs);
    timer.unref?.();
}

export function stopUsageAlerts(): void {
    if (timer) globalThis.clearInterval(timer);
    timer = undefined;
}
