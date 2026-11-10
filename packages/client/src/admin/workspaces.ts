import type { MoteurClient } from '../client.js';
import type {
    WorkspaceDetail,
    WorkspaceInviteRow,
    WorkspacePlace,
    WorkspaceSummary
} from '@moteurio/types';

/** The result of sending an invite: the invite link and whether the email was sent. */
export type WorkspaceInviteSent = {
    invite: WorkspaceInviteRow;
    path: string;
    url: string | null;
    emailed: boolean;
    emailError?: string;
};

const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

/** Workspaces (the teams that own projects), their members, and invites to join them. */
export function workspacesApi(client: MoteurClient) {
    return {
        list(): Promise<{ workspaces: WorkspaceSummary[] }> {
            return client.get('/workspaces');
        },
        get(workspaceId: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.get(ws(workspaceId));
        },
        /** Creates a workspace. The caller becomes its owner. */
        create(name: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.post('/workspaces', { name });
        },
        rename(workspaceId: string, name: string): Promise<{ workspace: WorkspaceDetail }> {
            return client.patch(ws(workspaceId), { name });
        },
        /** Deletes a workspace. Requires an owner, and the workspace must have no projects. */
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
            /** Removes a member from the workspace, which also removes them from its projects. Passing the caller's own user ID leaves the workspace. */
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
