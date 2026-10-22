/**
 * Acting as an agent: the person's token is swapped for an agent token (POST /auth/session-token
 * with `agent`), so what the tools change is marked "via Claude" and, unless the person allows
 * more, goes live only once a person approves it.
 */
import { createMoteurAdminClient, type MoteurAdminClient } from '@moteurio/client';

export interface Agent {
    name: string;
    reviewOnly: boolean;
}

/** How an MCP client names itself, as people would say it. */
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

/** The person's client as an agent's, renewed before it runs out. Needs a person's sign-in, not an API key. */
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
