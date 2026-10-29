import type { Schedule } from '@moteurio/types/Schedule.js';
import { canReview } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';
import { systemActor } from './utils/systemActor.js';
import { getProjectJson, putProjectJson, listProjectKeys } from './utils/projectStorage.js';
import { scheduleKey, scheduleListPrefix } from './utils/storageKeys.js';
import { loadProjects } from './projects.js';
import { updateEntry } from './entries.js';
import { updatePage } from './pages.js';
import { log, toActivityEvent } from './activityLogger.js';
import { triggerEvent } from './utils/eventBus.js';
import { createNotification } from './notifications.js';
import { getProjectUsers } from './users.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';

const timeouts = new Map<string, NodeJS.Timeout>();
// The file store has one writer. Claim before the first await so timer/sweep cannot run twice.
const running = new Map<string, Promise<void>>();
/** setTimeout fires at once for delays above 2^31−1 ms (~24.8 days): longer waits are re-armed. */
const MAX_TIMER_MS = 2 ** 31 - 1;
let sweepInterval: NodeJS.Timeout | null = null;

const SCHEDULER_USER: User = systemActor('_scheduler', 'Scheduler');

async function loadSchedule(projectId: string, scheduleId: string): Promise<Schedule | null> {
    return getProjectJson<Schedule>(projectId, scheduleKey(scheduleId));
}

async function saveSchedule(schedule: Schedule): Promise<void> {
    await putProjectJson(schedule.projectId, scheduleKey(schedule.id), schedule);
    triggerEvent('content.saved', {
        projectId: schedule.projectId,
        paths: [scheduleKey(schedule.id)],
        message: `Update schedule ${schedule.id} — ${SCHEDULER_USER.name}`,
        user: SCHEDULER_USER
    });
}

async function executeSchedule(projectId: string, scheduleId: string): Promise<void> {
    const key = `${projectId}:${scheduleId}`;
    const active = running.get(key);
    if (active) return active;
    const execution = executeScheduleOnce(projectId, scheduleId)
        .catch(error => {
            console.error('[Scheduler] Execution interrupted; will recover on next sweep:', error);
        })
        .finally(() => {
            running.delete(key);
        });
    running.set(key, execution);
    return execution;
}

async function executeScheduleOnce(projectId: string, scheduleId: string): Promise<void> {
    const schedule = await loadSchedule(projectId, scheduleId);
    if (!schedule || schedule.status !== 'pending') return;

    const now = new Date().toISOString();
    const updatedProcessing: Schedule = { ...schedule, status: 'processing', updatedAt: now };
    await saveSchedule(updatedProcessing);

    try {
        if (schedule.action === 'publish') {
            if (schedule.resourceType === 'entry' && schedule.modelId) {
                await updateEntry(
                    SCHEDULER_USER,
                    projectId,
                    schedule.modelId,
                    schedule.resourceId,
                    { status: 'published' },
                    { source: 'scheduler' }
                );
            } else if (schedule.resourceType === 'page') {
                await updatePage(projectId, SCHEDULER_USER, schedule.resourceId, {
                    status: 'published'
                });
            }
        } else {
            if (schedule.resourceType === 'entry' && schedule.modelId) {
                await updateEntry(
                    SCHEDULER_USER,
                    projectId,
                    schedule.modelId,
                    schedule.resourceId,
                    { status: 'unpublished' },
                    { source: 'scheduler' }
                );
            } else if (schedule.resourceType === 'page') {
                await updatePage(projectId, SCHEDULER_USER, schedule.resourceId, {
                    status: 'draft'
                });
            }
        }

        const doneSchedule: Schedule = {
            ...updatedProcessing,
            status: 'done',
            processedAt: now,
            updatedAt: now
        };
        await saveSchedule(doneSchedule);

        try {
            if (schedule.resourceType === 'entry' && schedule.modelId) {
                await webhookDispatch(
                    schedule.action === 'publish' ? 'entry.published' : 'entry.unpublished',
                    {
                        entryId: schedule.resourceId,
                        modelId: schedule.modelId,
                        status: schedule.action === 'publish' ? 'published' : 'unpublished',
                        updatedBy: SCHEDULER_USER.id
                    },
                    { projectId, source: 'scheduler' }
                );
            } else {
                await webhookDispatch(
                    schedule.action === 'publish' ? 'page.published' : 'page.unpublished',
                    {
                        pageId: schedule.resourceId,
                        title: '',
                        url: '',
                        updatedBy: SCHEDULER_USER.id
                    },
                    { projectId, source: 'scheduler' }
                );
            }
        } catch {
            // never fail the operation
        }

        try {
            await triggerEvent('schedule.executed', { schedule: doneSchedule, projectId });
        } catch {
            // never break on emit failure
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedSchedule: Schedule = {
            ...updatedProcessing,
            status: 'failed',
            error: errorMessage,
            processedAt: now,
            updatedAt: now
        };
        await saveSchedule(failedSchedule);

        try {
            log(
                toActivityEvent(
                    projectId,
                    'schedule',
                    scheduleId,
                    'schedule_failed',
                    undefined,
                    undefined,
                    { error: errorMessage }
                )
            );
        } catch {
            // swallow
        }

        try {
            if (schedule.resourceType === 'entry') {
                await webhookDispatch(
                    'entry.schedule.failed',
                    {
                        scheduleId,
                        entryId: schedule.resourceId,
                        modelId: schedule.modelId,
                        action: schedule.action,
                        error: errorMessage
                    },
                    { projectId, source: 'scheduler' }
                );
            } else {
                await webhookDispatch(
                    'page.schedule.failed',
                    {
                        scheduleId,
                        pageId: schedule.resourceId,
                        action: schedule.action,
                        error: errorMessage
                    },
                    { projectId, source: 'scheduler' }
                );
            }
        } catch {
            // never fail the operation
        }

        const project = loadProjects().find(p => p.id === projectId);
        const recipients = getProjectUsers(projectId, project).filter(u => canReview(u));
        const message = `Scheduled ${schedule.action} failed for ${schedule.resourceType} ${schedule.resourceId}: ${errorMessage}`;
        for (const recipient of recipients) {
            try {
                await createNotification(projectId, recipient.id, {
                    type: 'schedule_failed',
                    scheduleId,
                    error: message,
                    resourceType: schedule.resourceType,
                    resourceId: schedule.resourceId,
                    action: schedule.action
                });
            } catch {
                // swallow per-recipient failure
            }
        }

        try {
            await triggerEvent('schedule.failed', {
                schedule: failedSchedule,
                projectId,
                error: errorMessage
            });
        } catch {
            // never break on emit failure
        }
    }
}

export function register(schedule: Schedule): void {
    if (schedule.status !== 'pending') return;

    if (timeouts.has(schedule.id)) {
        clearTimeout(timeouts.get(schedule.id)!);
        timeouts.delete(schedule.id);
    }

    const delay = new Date(schedule.scheduledAt).getTime() - Date.now();
    if (delay <= 0) {
        void executeSchedule(schedule.projectId, schedule.id);
        return;
    }

    const handle = setTimeout(
        () => {
            timeouts.delete(schedule.id);
            if (delay > MAX_TIMER_MS) register(schedule);
            else void executeSchedule(schedule.projectId, schedule.id);
        },
        Math.min(delay, MAX_TIMER_MS)
    );
    timeouts.set(schedule.id, handle);
}

export function cancel(scheduleId: string): void {
    const handle = timeouts.get(scheduleId);
    if (handle) {
        clearTimeout(handle);
        timeouts.delete(scheduleId);
    }
}

export function startSweep(intervalMs: number = 5 * 60 * 1000): void {
    if (sweepInterval !== null) return;
    sweepInterval = globalThis.setInterval(() => {
        void sweep();
    }, intervalMs);
}

export function stopSweep(): void {
    if (sweepInterval !== null) {
        globalThis.clearInterval(sweepInterval);
        sweepInterval = null;
    }
    for (const handle of timeouts.values()) {
        clearTimeout(handle);
    }
    timeouts.clear();
}

/** Schedules being carried out now, finished (stopping waits for them rather than cut one off). */
export async function executionsIdle(): Promise<void> {
    while (running.size) await Promise.allSettled([...running.values()]);
}

export async function sweep(): Promise<void> {
    let registered = 0;
    let executed = 0;

    try {
        const projects = loadProjects();
        for (const project of projects) {
            try {
                const raw = await listProjectKeys(project.id, scheduleListPrefix());
                const ids = raw
                    .map(name => (name.endsWith('.json') ? name.slice(0, -5) : name))
                    .filter(Boolean);

                for (const id of ids) {
                    try {
                        let schedule = await getProjectJson<Schedule>(project.id, scheduleKey(id));
                        if (!schedule || running.has(`${project.id}:${schedule.id}`)) continue;
                        // In the single-writer process, processing without an active claim means
                        // the process stopped between claiming and recording completion. Replay
                        // the status assignment (at-least-once), never leave it stranded forever.
                        if (schedule.status === 'processing') {
                            schedule = {
                                ...schedule,
                                status: 'pending',
                                updatedAt: new Date().toISOString()
                            };
                            await saveSchedule(schedule);
                        }
                        if (schedule.status !== 'pending') continue;
                        if (timeouts.has(schedule.id)) continue;

                        const at = new Date(schedule.scheduledAt).getTime();
                        const now = Date.now();
                        if (at <= now) {
                            void executeSchedule(project.id, schedule.id);
                            executed++;
                        } else {
                            register(schedule);
                            registered++;
                        }
                    } catch {
                        // per-schedule: never throw
                    }
                }
            } catch {
                // per-project: never throw
            }
        }
        if (process.env.NODE_ENV !== 'production' || registered > 0 || executed > 0) {
            console.debug(`[Scheduler] sweep: ${registered} registered, ${executed} executed`);
        }
    } catch {
        // never throw
    }
}

export async function init(): Promise<void> {
    await sweep();
    startSweep();
    const n = timeouts.size;
    console.log(`[Scheduler] Initialized: ${n} pending schedules registered`);
}
