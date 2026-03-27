import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
    Schedule,
    CreateScheduleInput,
    ListSchedulesOptions
} from '@moteurio/types/Schedule.js';
import type { User } from '@moteurio/types/User.js';

export type { CreateScheduleInput, ListSchedulesOptions };
import { getProject } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import {
    getProjectJson,
    putProjectJson,
    deleteProjectKey,
    listProjectKeys
} from './utils/projectStorage.js';
import { scheduleKey, scheduleListPrefix } from './utils/storageKeys.js';
import { trashScheduleDir } from './utils/pathUtils.js';
import { triggerEvent } from './utils/eventBus.js';
import { dispatch as webhookDispatch } from './webhooks/webhookService.js';
import { hasApprovedReview, hasApprovedReviewForPage } from './reviews.js';
import * as schedulerEngine from './schedulerEngine.js';

function canSchedule(
    user: User,
    project: { workflow?: { enabled?: boolean; requireReview?: boolean } }
): boolean {
    if (!project.workflow?.enabled || !project.workflow?.requireReview) {
        return true;
    }
    const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
    const isReviewer = Array.isArray(user.roles) && user.roles.includes('reviewer');
    return isAdmin || isReviewer;
}

async function loadAllSchedulesForProject(projectId: string): Promise<Schedule[]> {
    const raw = await listProjectKeys(projectId, scheduleListPrefix());
    const ids = raw
        .map(name => (name.endsWith('.json') ? name.slice(0, -5) : name))
        .filter(Boolean);
    const schedules: Schedule[] = [];
    for (const id of ids) {
        const s = await getProjectJson<Schedule>(projectId, scheduleKey(id));
        if (s) schedules.push(s);
    }
    return schedules;
}

export async function listSchedules(
    user: User,
    projectId: string,
    options?: ListSchedulesOptions
): Promise<Schedule[]> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    let list = await loadAllSchedulesForProject(projectId);
    if (options?.resourceType) list = list.filter(s => s.resourceType === options.resourceType);
    if (options?.resourceId) list = list.filter(s => s.resourceId === options.resourceId);
    if (options?.status !== undefined) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        list = list.filter(s => statuses.includes(s.status));
    }
    if (options?.action) list = list.filter(s => s.action === options.action);
    list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return list;
}

export async function getSchedule(
    user: User,
    projectId: string,
    scheduleId: string
): Promise<Schedule> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const schedule = await getProjectJson<Schedule>(projectId, scheduleKey(scheduleId));
    if (!schedule) {
        throw new Error(`Schedule "${scheduleId}" not found in project "${projectId}".`);
    }
    return schedule;
}

export async function getSchedulesForResource(
    projectId: string,
    resourceType: 'entry' | 'page',
    resourceId: string
): Promise<Schedule[]> {
    const list = await loadAllSchedulesForProject(projectId);
    return list.filter(
        s =>
            s.resourceType === resourceType &&
            s.resourceId === resourceId &&
            s.status !== 'cancelled' &&
            s.status !== 'done'
    );
}

export async function createSchedule(
    user: User,
    projectId: string,
    input: CreateScheduleInput
): Promise<Schedule> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    if (!input.resourceType || !input.resourceId) {
        throw new Error('resourceType and resourceId are required.');
    }
    if (input.resourceType === 'entry' && !input.modelId) {
        throw new Error('modelId is required when resourceType is entry.');
    }

    const scheduledDate = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
        throw new Error('Invalid scheduledAt date.');
    }
    if (scheduledDate.getTime() < Date.now()) {
        throw new Error('scheduledAt must be in the future.');
    }
    const scheduledAt = scheduledDate.toISOString();

    if (!canSchedule(user, project)) {
        const err = new Error(
            'Only users with reviewer or admin role can schedule when review workflow is enabled.'
        );
        (err as Error & { statusCode?: number }).statusCode = 403;
        throw err;
    }

    if (input.action === 'publish') {
        if (project.workflow?.enabled && project.workflow?.requireReview) {
            if (input.resourceType === 'entry' && input.modelId) {
                const approved = await hasApprovedReview(
                    projectId,
                    input.modelId,
                    input.resourceId
                );
                if (!approved) {
                    throw new Error(
                        'Entry must have an approved review before it can be scheduled for publish.'
                    );
                }
            }
            if (input.resourceType === 'page') {
                const approved = await hasApprovedReviewForPage(projectId, input.resourceId);
                if (!approved) {
                    throw new Error(
                        'Page must have an approved review before it can be scheduled for publish.'
                    );
                }
            }
        }
    }

    const existing = await getSchedulesForResource(projectId, input.resourceType, input.resourceId);
    const pendingSameAction = existing.find(
        s => s.action === input.action && s.status === 'pending'
    );
    if (pendingSameAction) {
        throw new Error(
            'A pending schedule already exists for this resource and action. Cancel it before creating a new one.'
        );
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const schedule: Schedule = {
        id,
        projectId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        modelId: input.modelId,
        action: input.action,
        scheduledAt,
        scheduledBy: user.id,
        status: 'pending',
        createdAt: now,
        updatedAt: now
    };

    try {
        await triggerEvent('schedule.beforeCreate', { schedule, user, projectId });
    } catch {
        // never break on emit failure
    }

    await putProjectJson(projectId, scheduleKey(id), schedule);

    triggerEvent('content.saved', {
        projectId,
        paths: [scheduleKey(id)],
        message: `Create schedule ${id} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('schedule.afterCreate', { schedule, user, projectId });
    } catch {
        // never break on emit failure
    }

    try {
        if (input.resourceType === 'entry') {
            webhookDispatch(
                'entry.scheduled',
                {
                    scheduleId: id,
                    entryId: input.resourceId,
                    modelId: input.modelId!,
                    action: input.action,
                    scheduledAt
                },
                { projectId, source: 'api' }
            );
        } else {
            webhookDispatch(
                'page.scheduled',
                {
                    scheduleId: id,
                    pageId: input.resourceId,
                    action: input.action,
                    scheduledAt
                },
                { projectId, source: 'api' }
            );
        }
    } catch {
        // never fail the operation
    }

    try {
        schedulerEngine.register(schedule);
    } catch {
        // never fail the operation
    }

    return schedule;
}

export async function cancelSchedule(
    user: User,
    projectId: string,
    scheduleId: string
): Promise<Schedule> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const schedule = await getProjectJson<Schedule>(projectId, scheduleKey(scheduleId));
    if (!schedule) {
        throw new Error(`Schedule "${scheduleId}" not found in project "${projectId}".`);
    }
    if (schedule.status !== 'pending') {
        throw new Error('Only pending schedules can be cancelled.');
    }

    const now = new Date().toISOString();
    const updated: Schedule = { ...schedule, status: 'cancelled', updatedAt: now };
    await putProjectJson(projectId, scheduleKey(scheduleId), updated);

    triggerEvent('content.saved', {
        projectId,
        paths: [scheduleKey(scheduleId)],
        message: `Cancel schedule ${scheduleId} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('schedule.afterCancel', { schedule: updated, user, projectId });
    } catch {
        // never break on emit failure
    }

    try {
        if (schedule.resourceType === 'entry') {
            webhookDispatch(
                'entry.unscheduled',
                {
                    scheduleId,
                    entryId: schedule.resourceId,
                    modelId: schedule.modelId,
                    action: schedule.action
                },
                { projectId, source: 'api' }
            );
        } else {
            webhookDispatch(
                'page.unscheduled',
                { scheduleId, pageId: schedule.resourceId, action: schedule.action },
                { projectId, source: 'api' }
            );
        }
    } catch {
        // never fail the operation
    }

    try {
        schedulerEngine.cancel(scheduleId);
    } catch {
        // never fail the operation
    }

    return updated;
}

export async function deleteSchedule(
    user: User,
    projectId: string,
    scheduleId: string
): Promise<void> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const schedule = await getProjectJson<Schedule>(projectId, scheduleKey(scheduleId));
    if (!schedule) {
        throw new Error(`Schedule "${scheduleId}" not found in project "${projectId}".`);
    }
    if (schedule.status === 'pending' || schedule.status === 'processing') {
        throw new Error('Cancel the schedule before deleting it.');
    }

    const trashDir = trashScheduleDir(projectId, scheduleId);
    fs.mkdirSync(trashDir, { recursive: true });
    const dest = path.join(trashDir, `${scheduleId}-${Date.now()}.json`);
    fs.writeFileSync(dest, JSON.stringify(schedule, null, 2), 'utf-8');
    await deleteProjectKey(projectId, scheduleKey(scheduleId));

    triggerEvent('content.deleted', {
        projectId,
        paths: [scheduleKey(scheduleId)],
        message: `Delete schedule ${scheduleId} — ${user.name ?? user.id}`,
        user
    });
    try {
        await triggerEvent('schedule.afterDelete', { schedule, user, projectId });
    } catch {
        // never break on emit failure
    }
}
