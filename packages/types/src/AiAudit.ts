/**
 * Audit trail for AI calls, kept separate from content activity.
 * Full prompts and responses are stored on disk, and the API exposes them to operators only.
 */

export interface AiAuditEvent {
    id: string;
    projectId: string;
    userId: string;
    userName: string;
    timestamp: string;
    /** The AI action performed, for example `generate.entry`, `write.draft` or `translate.field`. */
    action: string;
    /** Provider ID taken from the environment configuration, for example `openai`, `anthropic` or `mock`. */
    provider: string;
    /** ID of the specific AI model used, when known. */
    providerModel?: string;
    creditsUsed: number;
    creditsRemainingAfter: number;
    success: boolean;
    errorMessage?: string;
    /** ID of the content model the call applied to, when applicable. */
    modelId?: string;
    entryId?: string | null;
    fieldPath?: string;
    locale?: string;
    /** Included in API responses for operators only. */
    systemPrompt?: string;
    userPrompt?: string;
    /** The raw model output, as text or a stringified value. Included in API responses for operators only. */
    response?: string;
}

export type AiAuditEventSummary = Omit<AiAuditEvent, 'systemPrompt' | 'userPrompt' | 'response'>;

export interface AiAuditLogPage {
    events: AiAuditEventSummary[];
    nextBefore?: string;
}
