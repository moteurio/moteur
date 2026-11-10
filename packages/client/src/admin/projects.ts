import type { MoteurClient } from '../client.js';
import type {
    ProjectSchema,
    Comment,
    RadarReport,
    ActivityLogPage,
    ProjectMemberUser
} from '@moteurio/types';

/** The response of `GET /projects/:id/git/status`: the current branch, the last commit, the remote URL and the number of unpushed commits. */
export type GitStatus = {
    branch: string | null;
    remoteUrl: string | null;
    lastCommit: {
        hash: string;
        message: string;
        authorName: string;
        authorEmail: string;
        date: string;
    } | null;
    /** Number of local commits not yet pushed to the remote. It is 0 when the remote has every commit, and null when no remote URL is set. */
    unpushed: number | null;
    /** Whether pushes use an access token. The token itself is never returned. */
    token?: GitTokenInfo;
};

export type GitTokenInfo = { hasToken: boolean; username?: string; setAt?: string };
export function projectsApi(client: MoteurClient) {
    return {
        /** Lists the projects the user belongs to. With `workspaceId`, only that workspace's projects are returned. */
        list(workspaceId?: string): Promise<{ projects: ProjectSchema[] }> {
            return client.get('/projects', workspaceId ? { workspace: workspaceId } : undefined);
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
        /** Moves a project to another workspace. Requires an owner or admin of the project's current workspace. */
        move(projectId: string, workspaceId: string): Promise<{ project: ProjectSchema }> {
            return client.post(`/projects/${encodeURIComponent(projectId)}/move`, { workspaceId });
        },
        /** Converts a demo copy into a regular project of the user, which then counts toward their plan. Requires the Admin role. */
        keep(projectId: string): Promise<{ project: ProjectSchema }> {
            return client.post(`/projects/${encodeURIComponent(projectId)}/keep`, {});
        },
        users(projectId: string): Promise<{ users: ProjectMemberUser[] }> {
            return client.get(`/projects/${encodeURIComponent(projectId)}/users`);
        },
        /** Updates a user's account details. Requires a platform operator (`admin`). The target user must belong to the project. */
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
        /** Reports the state of the content's Git history and pushes it on demand. Requires an admin. */
        git: {
            status(projectId: string): Promise<GitStatus> {
                return client.get(`/projects/${encodeURIComponent(projectId)}/git/status`);
            },
            push(projectId: string): Promise<GitStatus & { pushed: boolean }> {
                return client.post(`/projects/${encodeURIComponent(projectId)}/git/push`);
            },
            /** Sets the access token used for pushes. Requires an admin. The token is stored encrypted and never returned. */
            setToken(
                projectId: string,
                body: { token: string; username?: string }
            ): Promise<GitTokenInfo> {
                return client.put(`/projects/${encodeURIComponent(projectId)}/git/token`, body);
            },
            removeToken(projectId: string): Promise<GitTokenInfo> {
                return client.delete(`/projects/${encodeURIComponent(projectId)}/git/token`);
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
                    /** When true, runs a full scan instead of returning the stored report (sent as the query parameter `scan=true`). */
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
