/**
 * Separate audit trail for AI calls (not content activity).
 * Full prompts/responses are stored on disk but only exposed to operators via API.
 */

export interface AiAuditEvent {
    id: string;
    projectId: string;
    userId: string;
    userName: string;
    timestamp: string;
    /** e.g. generate.entry, write.draft, translate.field */
    action: string;
    /** Provider id from env, e.g. openai, anthropic, mock */
    provider: string;
    /** Optional concrete model id when known */
    providerModel?: string;
    creditsUsed: number;
    creditsRemainingAfter: number;
    success: boolean;
    errorMessage?: string;
    /** Content model id when applicable */
    modelId?: string;
    entryId?: string | null;
    fieldPath?: string;
    locale?: string;
    /** Operator-only in API responses */
    systemPrompt?: string;
    userPrompt?: string;
    /** Raw model output (text or stringified) */
    response?: string;
}

export type AiAuditEventSummary = Omit<AiAuditEvent, 'systemPrompt' | 'userPrompt' | 'response'>;

export interface AiAuditLogPage {
    events: AiAuditEventSummary[];
    nextBefore?: string;
}
