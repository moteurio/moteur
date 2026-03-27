import { randomUUID } from 'crypto';
import type { AiAuditEvent, AiAuditEventSummary, AiAuditLogPage } from '@moteurio/types/AiAudit.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { AI_AUDIT_KEY } from './utils/storageKeys.js';

const DEFAULT_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const MAX_EVENTS_IN_FILE = 5000;

export type AiAuditAppendInput = Omit<AiAuditEvent, 'id' | 'timestamp'>;

export function toAiAuditSummary(e: AiAuditEvent): AiAuditEventSummary {
    const { systemPrompt: _s, userPrompt: _u, response: _r, ...rest } = e;
    return rest;
}

/** Append an AI audit row. Never throws; failures are swallowed. */
export function appendAiAuditEvent(input: AiAuditAppendInput): void {
    const event: AiAuditEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        ...input
    };
    try {
        getProjectJson<AiAuditEvent[]>(event.projectId, AI_AUDIT_KEY)
            .then(raw => {
                const list = Array.isArray(raw) ? raw : [];
                const next = [...list, event];
                const trimmed =
                    next.length > MAX_EVENTS_IN_FILE ? next.slice(-MAX_EVENTS_IN_FILE) : next;
                return putProjectJson(event.projectId, AI_AUDIT_KEY, trimmed);
            })
            .catch(() => {
                /* ignore */
            });
    } catch {
        /* ignore */
    }
}

/** Events stored oldest-first; page is newest-first. */
function slicePage(events: AiAuditEvent[], limit: number, before?: string): AiAuditLogPage {
    let list = events;
    if (before) {
        list = events.filter(e => e.timestamp < before);
    }
    const page = list.slice(-limit).reverse();
    const hasMore = list.length > limit;
    return {
        events: page.map(toAiAuditSummary),
        ...(hasMore && page.length > 0 && { nextBefore: page[page.length - 1]!.timestamp })
    };
}

export async function getProjectAiAuditLog(
    projectId: string,
    limit: number = DEFAULT_LIMIT,
    before?: string
): Promise<AiAuditLogPage> {
    try {
        const cap = Math.min(Math.max(1, limit), MAX_QUERY_LIMIT);
        const events = (await getProjectJson<AiAuditEvent[]>(projectId, AI_AUDIT_KEY)) ?? [];
        return slicePage(events, cap, before);
    } catch {
        return { events: [] };
    }
}

export async function getAiAuditEventById(
    projectId: string,
    eventId: string
): Promise<AiAuditEvent | undefined> {
    try {
        const events = (await getProjectJson<AiAuditEvent[]>(projectId, AI_AUDIT_KEY)) ?? [];
        return events.find(e => e.id === eventId);
    } catch {
        return undefined;
    }
}
