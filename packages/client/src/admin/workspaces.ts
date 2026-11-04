import type { MoteurClient } from '../client.js';
import type {
    WorkspaceDetail,
    WorkspaceInviteRow,
    WorkspacePlace,
    WorkspaceSummary
} from '@moteurio/types';

/** What sending an invite says: its link, and whether the email went out. */
export type WorkspaceInviteSent = {
    invite: WorkspaceInviteRow;
    path: string;
    url: string | null;
    emailed: boolean;
    emailError?: string;
};

const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

/** The teams that own projects: yours, their people, and invites into them. */
export function workspacesApi(client: MoteurClient) {
    return {
        list(): Promise<{ workspaces: WorkspaceSummary[] }> {
            return client.get('/workspaces');
        },
        get(workspaceId: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.get(ws(workspaceId));
        },
        /** You are its owner. */
        create(name: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.post('/workspaces', { name });
        },
        rename(workspaceId: string, name: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.patch(ws(workspaceId), { name });
        },
        /** Owners only, once it has no projects. */
        delete(workspaceId: string): Promise<void> {
            return client.delete(ws(workspaceId));
        },
        members: {
            update(
                workspaceId: string,
                userId: string,
                place: WorkspacePlace
            ): Promise<{ workspace: WorkspaceDetail }> {
                return client.patch(
                    `${ws(workspaceId)}/members/${encodeURIComponent(userId)}`,
                    place
                );
            },
            /** They leave its projects too. Your own id: you leave it. */
            remove(workspaceId: string, userId: string): Promise<void> {
                return client.delete(`${ws(workspaceId)}/members/${encodeURIComponent(userId)}`);
            }
        },
        invites: {
            list(workspaceId: string): Promise<{ invites: WorkspaceInviteRow[] }> {
                return client.get(`${ws(workspaceId)}/invites`);
            },
            send(
                workspaceId: string,
                body: WorkspacePlace & {
                    email: string;
                    note?: string;
                    appUrl?: string;
                    locale?: string;
                }
            ): Promise<WorkspaceInviteSent> {
                return client.post(`${ws(workspaceId)}/invites`, body);
            },
            resend(
                workspaceId: string,
                inviteId: string,
                body: { appUrl?: string; locale?: string } = {}
            ): Promise<WorkspaceInviteSent> {
                return client.post(
                    `${ws(workspaceId)}/invites/${encodeURIComponent(inviteId)}/resend`,
                    body
                );
            },
            withdraw(workspaceId: string, inviteId: string): Promise<void> {
                return client.delete(`${ws(workspaceId)}/invites/${encodeURIComponent(inviteId)}`);
            }
        }
    };
}
