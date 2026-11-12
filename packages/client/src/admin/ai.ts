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
        /** Provider ID from the `MOTEUR_AI_PROVIDER` environment variable when set (for example `openai`, `anthropic` or `mock`). */
        provider: string | null;
    };
    credits: {
        remaining: number;
        unlimited: boolean;
    };
}

/** Availability of a helper: `ok` (usable), `off` (disabled for the project) or `role` (not allowed for the user's role). */
export type AiHelperState = 'ok' | 'off' | 'role';
export type AiHelperName = 'write' | 'translate' | 'alt' | 'notes' | 'images' | 'audio' | 'model3d';

export interface AiHelpers {
    /** True when an AI provider is configured on the server. */
    ready: boolean;
    provider: string | null;
    helpers: Record<AiHelperName, AiHelperState>;
    describeUploads: boolean;
    provenanceForAll: boolean;
    credits: { remaining: number; unlimited: boolean };
    /** Credit cost per action, keyed by action name such as `write.shorten`, `translate.field` or `analyse.image`. */
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
    /** The generated audio variants: each has the audio as base64 and its MIME type (usually `audio/mpeg`). */
    variants: { audioBase64: string; mimeType: string }[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

export interface AiModel3dResult {
    /** The generated models: each has the provider's download URL (which expires), its format and an optional preview image URL. */
    variants: { url: string; format: string; thumbnailUrl?: string }[];
    prompt: string;
    creditsUsed: number;
    creditsRemaining: number;
}

/**
 * AI helpers (`/ai/*`). These routes are provided by the AI plugin. On a server without the
 * plugin, these calls fail with 404, except `activity` (the engine's audit log), which returns an
 * empty log.
 */
export function aiApi(client: MoteurClient) {
    return {
        /** Returns which helpers the current user can use in a project, with the remaining credits and the cost of each action. */
        helpers(projectId: string): Promise<AiHelpers> {
            return client.get<AiHelpers>(`/ai/helpers/${encodeURIComponent(projectId)}`);
        },
        /** Returns AI-written text for one field. Nothing is saved. */
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
        /** Translates a field's text into another locale. Nothing is saved. */
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
        /** Returns suggested alt text and caption for an image. Nothing is saved. */
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
        /** Generates speech from text with ElevenLabs or another audio provider. Nothing is saved. */
        generateAudio(params: {
            projectId: string;
            prompt: string;
            voice?: string;
            entryId?: string;
            fieldPath?: string;
        }): Promise<AiAudioResult> {
            return client.post<AiAudioResult>('/ai/generate-audio', params);
        },
        /** Generates a 3D model from a text description with Meshy or another provider. This can take minutes. Nothing is saved. */
        generateModel3d(params: {
            projectId: string;
            prompt: string;
            textured?: boolean;
            format?: 'glb' | 'usdz';
            entryId?: string;
            fieldPath?: string;
        }): Promise<AiModel3dResult> {
            // Providers generate the model while the request waits, so allow ten minutes instead of the default timeout.
            return client.request<AiModel3dResult>({
                method: 'post',
                url: '/ai/generate-3d',
                data: params,
                timeout: 10 * 60_000
            });
        },
        /** Saves a generated model by having the server download it from the provider into the media library. */
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
        /** Lists the AI helper activity in a project, newest first, at most 200 entries per call. */
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
