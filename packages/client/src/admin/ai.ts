import type { MoteurClient } from '../client.js';

export interface GenerateEntryParams {
    prompt: string;
    projectId: string;
    modelId: string;
    locale?: string;
}

export interface GenerateEntryResult {
    success: boolean;
    entry: unknown;
    creditsUsed: number;
    creditsRemaining: number;
}

export interface AiProjectOverview {
    textAi: {
        enabled: boolean;
        /** Env `MOTEUR_AI_PROVIDER` when set (e.g. openai, anthropic, mock). */
        provider: string | null;
    };
    credits: {
        remaining: number;
        unlimited: boolean;
    };
}

/** Per helper: usable, off for the project, or not for this person's role. */
export type AiHelperState = 'ok' | 'off' | 'role';
export type AiHelperName = 'write' | 'translate' | 'alt' | 'notes' | 'images';

export interface AiHelpers {
    /** A provider is set up on the server. */
    ready: boolean;
    provider: string | null;
    helpers: Record<AiHelperName, AiHelperState>;
    describeUploads: boolean;
    provenanceForAll: boolean;
    credits: { remaining: number; unlimited: boolean };
    /** Credits per action, e.g. `write.shorten`, `translate.field`, `analyse.image`. */
    costs: Record<string, number>;
}

export type WritingAction =
    | 'draft'
    | 'rewrite'
    | 'shorten'
    | 'expand'
    | 'tone:formal'
    | 'tone:conversational'
    | 'tone:editorial'
    | 'summarise-excerpt';

export interface AiTextResult {
    text: string;
    creditsUsed: number;
    creditsRemaining: number;
}

export function aiApi(client: MoteurClient) {
    return {
        /** What this person may ask for in a project, with credits and costs. */
        helpers(projectId: string): Promise<AiHelpers> {
            return client.get<AiHelpers>(`/ai/helpers/${encodeURIComponent(projectId)}`);
        },
        /** A suggestion for one field; nothing is saved. */
        write(params: {
            projectId: string;
            action: WritingAction;
            field: { key: string; label?: string; type?: string };
            value?: string;
            body?: string;
            locale?: string;
            modelId?: string;
            entryId?: string;
        }): Promise<AiTextResult> {
            return client.post<AiTextResult>('/ai/write', params);
        },
        /** A field's text in another language; nothing is saved. */
        translateField(params: {
            projectId: string;
            value: string;
            from: string;
            to: string;
            field?: { key: string; type?: string };
            modelId?: string;
            entryId?: string;
        }): Promise<AiTextResult> {
            return client.post<AiTextResult>('/ai/translate/field', params);
        },
        /** Suggested alt text and caption for a picture; nothing is saved. */
        analyseImage(params: {
            projectId: string;
            assetId: string;
            locale?: string;
            otherAlt?: string;
        }): Promise<{
            alt: string;
            caption: string;
            creditsUsed: number;
            creditsRemaining: number;
        }> {
            return client.post('/ai/analyse/image', params);
        },
        generateEntry(params: GenerateEntryParams): Promise<GenerateEntryResult> {
            return client.post<GenerateEntryResult>('/ai/generate/entry', params);
        },
        projectOverview(projectId: string): Promise<AiProjectOverview> {
            return client.get<AiProjectOverview>(`/ai/settings/${encodeURIComponent(projectId)}`);
        }
    };
}
