import type { MoteurClient } from '../client.js';
import type { AiAuditLogPage } from '@moteurio/types';

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
export type AiHelperName = 'write' | 'translate' | 'alt' | 'notes' | 'images' | 'audio' | 'model3d';

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

export interface AiAudioResult {
    /** Each take: the sound as base64, and its MIME type (usually audio/mpeg). */
    variants: { audioBase64: string; mimeType: string }[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

export interface AiModel3dResult {
    /** Each model: the provider's (expiring) link, its format and a preview picture. */
    variants: { url: string; format: string; thumbnailUrl?: string }[];
    prompt: string;
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
        /** Speech from text (ElevenLabs or another audio provider); nothing is saved. */
        generateAudio(params: {
            projectId: string;
            prompt: string;
            voice?: string;
            entryId?: string;
            fieldPath?: string;
        }): Promise<AiAudioResult> {
            return client.post<AiAudioResult>('/ai/generate-audio', params);
        },
        /** A 3D model from a description (Meshy or another provider). Can take minutes; nothing is saved. */
        generateModel3d(params: {
            projectId: string;
            prompt: string;
            textured?: boolean;
            format?: 'glb' | 'usdz';
            entryId?: string;
            fieldPath?: string;
        }): Promise<AiModel3dResult> {
            // Providers build the model while the request waits: allow ten minutes, not one.
            return client.request<AiModel3dResult>({
                method: 'post',
                url: '/ai/generate-3d',
                data: params,
                timeout: 10 * 60_000
            });
        },
        /** Keeps a generated model: the server fetches it from the provider into the media library. */
        saveGeneratedModel(params: {
            projectId: string;
            url: string;
            format?: 'glb' | 'usdz';
            thumbnailUrl?: string;
            prompt?: string;
            provider?: string;
            title?: string;
            entryId?: string;
            fieldPath?: string;
        }): Promise<{
            asset: Record<string, unknown> & { id: string; url: string };
            poster?: Record<string, unknown> & { id: string; url: string };
        }> {
            return client.request({
                method: 'post',
                url: '/ai/save-generated-model',
                data: params,
                timeout: 3 * 60_000
            });
        },
        /** What the helpers did in a project, newest first (at most 200 at a time). */
        activity(
            projectId: string,
            params: { limit?: number; before?: string } = {}
        ): Promise<AiAuditLogPage> {
            return client.get<AiAuditLogPage>(
                `/projects/${encodeURIComponent(projectId)}/ai-audit`,
                params
            );
        },
        generateEntry(params: GenerateEntryParams): Promise<GenerateEntryResult> {
            return client.post<GenerateEntryResult>('/ai/generate/entry', params);
        },
        projectOverview(projectId: string): Promise<AiProjectOverview> {
            return client.get<AiProjectOverview>(`/ai/settings/${encodeURIComponent(projectId)}`);
        }
    };
}
