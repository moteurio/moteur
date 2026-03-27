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

export function aiApi(client: MoteurClient) {
    return {
        generateEntry(params: GenerateEntryParams): Promise<GenerateEntryResult> {
            return client.post<GenerateEntryResult>('/ai/generate/entry', params);
        },
        projectOverview(projectId: string): Promise<AiProjectOverview> {
            return client.get<AiProjectOverview>(`/ai/settings/${encodeURIComponent(projectId)}`);
        }
    };
}
