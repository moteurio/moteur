/**
 * Lets the MCP server act as an agent. The user's token is exchanged for an agent token
 * (POST /auth/session-token with `agent`). Changes made by the tools are marked as made via the
 * agent, for example "via Claude", and go live only after a person approves them, unless the user allows otherwise.
 */
import { createMoteurAdminClient, type MoteurAdminClient } from '@moteurio/client';

export interface Agent {
    name: string;
    reviewOnly: boolean;
}

/** Returns a readable name for an MCP client, such as "Claude Code" instead of `claude-code`. */
export function agentName(info: { name?: string; title?: string } | undefined): string {
    if (info?.title) return info.title;
    const known: Record<string, string> = {
        'claude-ai': 'Claude',
        'claude-code': 'Claude Code',
        'claude-desktop': 'Claude'
    };
    const name = info?.name?.trim();
    return (name && known[name.toLowerCase()]) || name || 'an agent';
}

/** Wraps the user's client as an agent client and renews the agent token shortly before it expires. It needs a user's sign-in and does not work with an API key. */
export function agentClient(
    person: () => Promise<MoteurAdminClient>,
    agent: () => Agent
): () => Promise<MoteurAdminClient> {
    let current: { client: MoteurAdminClient; until: number } | undefined;
    return async () => {
        if (current && current.until - Date.now() > 5 * 60_000) return current.client;
        const base = await person();
        const { sessionToken, expiresAt } = await base.request<{
            sessionToken: string;
            expiresAt: string;
        }>({
            method: 'POST',
            url: '/auth/session-token',
            data: { agent: agent() }
        });
        current = {
            client: createMoteurAdminClient({
                baseURL: base.baseURL,
                auth: { type: 'bearer', token: sessionToken }
            }),
            until: Date.parse(expiresAt)
        };
        return current.client;
    };
}
