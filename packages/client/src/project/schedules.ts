import type { MoteurClient } from '../client.js';
import type { CreateScheduleInput, ListSchedulesOptions, Schedule } from '@moteurio/types';

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/schedules`;

function listParams(
    options?: ListSchedulesOptions
): Record<string, string | number | boolean | undefined> | undefined {
    if (!options) return undefined;
    const status = options.status;
    return {
        resourceType: options.resourceType,
        resourceId: options.resourceId,
        action: options.action,
        status: Array.isArray(status) ? status.join(',') : status
    };
}

export function projectSchedulesApi(client: MoteurClient) {
    return {
        list(
            projectId: string,
            options?: ListSchedulesOptions
        ): Promise<{ schedules: Schedule[] }> {
            return client
                .get<Schedule[] | { schedules: Schedule[] }>(base(projectId), listParams(options))
                .then(data =>
                    Array.isArray(data) ? { schedules: data } : { schedules: data.schedules ?? [] }
                );
        },
        get(projectId: string, scheduleId: string): Promise<Schedule> {
            return client.get(`${base(projectId)}/${encodeURIComponent(scheduleId)}`);
        },
        create(projectId: string, body: CreateScheduleInput): Promise<Schedule> {
            return client.post(base(projectId), body);
        },
        cancel(projectId: string, scheduleId: string): Promise<Schedule> {
            return client.post(`${base(projectId)}/${encodeURIComponent(scheduleId)}/cancel`);
        },
        delete(projectId: string, scheduleId: string): Promise<void> {
            return client.delete(`${base(projectId)}/${encodeURIComponent(scheduleId)}`);
        }
    };
}
