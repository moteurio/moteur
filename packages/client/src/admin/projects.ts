import type { MoteurClient } from '../client.js';
import type {
    ProjectSchema,
    Comment,
    RadarReport,
    ActivityLogPage,
    ProjectMemberUser
} from '@moteurio/types';

export function projectsApi(client: MoteurClient) {
    return {
        list(): Promise<{ projects: ProjectSchema[] }> {
            return client.get('/projects');
        },
        get(projectId: string): Promise<{ project: ProjectSchema }> {
            return client.get(`/projects/${encodeURIComponent(projectId)}`);
        },
        create(body: Record<string, unknown>): Promise<{ project: ProjectSchema }> {
            return client.post('/projects', body);
        },
        update(
            projectId: string,
            body: Record<string, unknown>
        ): Promise<{ project: ProjectSchema }> {
            return client.patch(`/projects/${encodeURIComponent(projectId)}`, body);
        },
        delete(projectId: string): Promise<void> {
            return client.delete(`/projects/${encodeURIComponent(projectId)}`);
        },
        users(projectId: string): Promise<{ users: ProjectMemberUser[] }> {
            return client.get(`/projects/${encodeURIComponent(projectId)}/users`);
        },
        /** Platform operator (`admin`) only. Target user must belong to the project. */
        patchProjectUser(
            projectId: string,
            userId: string,
            body: {
                name?: string;
                email?: string;
                isActive?: boolean;
                roles?: string[];
                avatar?: string;
            }
        ): Promise<{ user: ProjectMemberUser }> {
            return client.patch(
                `/projects/${encodeURIComponent(projectId)}/users/${encodeURIComponent(userId)}`,
                body
            );
        },
        activity: {
            list(
                projectId: string,
                params?: { limit?: number; before?: string }
            ): Promise<ActivityLogPage> {
                const q: Record<string, string | number> = {};
                if (params?.limit != null) q.limit = params.limit;
                if (params?.before != null) q.before = params.before;
                return client.get(
                    `/projects/${encodeURIComponent(projectId)}/activity`,
                    q as Record<string, string>
                );
            }
        },
        branches: {
            list(projectId: string): Promise<{ branches: string[]; current?: string }> {
                return client.get(`/projects/${encodeURIComponent(projectId)}/branches`);
            },
            create(
                projectId: string,
                name: string,
                from?: string
            ): Promise<{ branch: string; from: string }> {
                return client.post(`/projects/${encodeURIComponent(projectId)}/branches`, {
                    name,
                    from: from ?? 'HEAD'
                });
            },
            switch(projectId: string, branch: string): Promise<{ branch: string }> {
                return client.post(`/projects/${encodeURIComponent(projectId)}/branches/switch`, {
                    branch
                });
            },
            merge(projectId: string, sourceBranch: string): Promise<{ merged: string }> {
                return client.post(`/projects/${encodeURIComponent(projectId)}/branches/merge`, {
                    sourceBranch
                });
            }
        },
        radar: {
            get(
                projectId: string,
                options?: {
                    /** When true, runs a full scan (query: `scan=true`). */
                    fullScan?: boolean;
                    severity?: string;
                    model?: string;
                    locale?: string;
                    ruleId?: string;
                }
            ): Promise<RadarReport> {
                const q: Record<string, string> = {};
                if (options?.fullScan) q.scan = 'true';
                if (options?.severity) q.severity = options.severity;
                if (options?.model) q.model = options.model;
                if (options?.locale) q.locale = options.locale;
                if (options?.ruleId) q.ruleId = options.ruleId;
                const params = Object.keys(q).length ? q : undefined;
                return client.get(`/projects/${encodeURIComponent(projectId)}/radar`, params);
            }
        },
        comments: {
            list(
                projectId: string,
                params: {
                    resourceType: string;
                    resourceId: string;
                    includeResolved?: boolean;
                    fieldPath?: string;
                }
            ): Promise<{ comments: Comment[] }> {
                const q: Record<string, string> = {
                    resourceType: params.resourceType,
                    resourceId: params.resourceId
                };
                if (params.includeResolved !== undefined)
                    q.includeResolved = String(params.includeResolved);
                if (params.fieldPath !== undefined) q.fieldPath = params.fieldPath;
                return client.get(`/projects/${encodeURIComponent(projectId)}/comments`, q);
            },
            add(
                projectId: string,
                body: {
                    resourceType: string;
                    resourceId: string;
                    body: string;
                    fieldPath?: string;
                    blockId?: string;
                    parentId?: string;
                }
            ): Promise<{ comment: Comment }> {
                return client.post(`/projects/${encodeURIComponent(projectId)}/comments`, body);
            },
            resolve(projectId: string, commentId: string): Promise<{ comment: Comment }> {
                return client.post(
                    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/resolve`
                );
            },
            delete(projectId: string, commentId: string): Promise<void> {
                return client.delete(
                    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`
                );
            },
            edit(
                projectId: string,
                commentId: string,
                body: { body: string }
            ): Promise<{ comment: Comment }> {
                return client.patch(
                    `/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
                    body
                );
            }
        }
    };
}
