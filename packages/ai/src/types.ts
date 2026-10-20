/**
 * AI layer types — provider-agnostic interface for Moteur AI features.
 * See product spec: Moteur AI Layer (Prompt 06).
 */

export interface CreditBalance {
    remaining: number;
    used?: number;
    plan?: string;
}

export interface MoteurAIContext {
    projectId: string;
    projectName?: string;
    projectLocales: string[];
    defaultLocale: string;
    model?: { id: string; label: string; fields: Record<string, unknown> };
    entry?: Record<string, unknown>;
    credits: CreditBalance;
}

export interface GenerateOptions {
    maxTokens?: number;
    temperature?: number;
    system?: string;
}

export interface ImageGenerateOptions {
    aspectRatio?: '1:1' | '4:3' | '16:9' | '3:2';
    count?: number;
}

export interface ImageResult {
    url: string;
    width: number;
    height: number;
    prompt: string;
}

export interface AudioGenerateOptions {
    /** ElevenLabs voice name or id; fal uses voice name when routed via fal. */
    voice?: string;
    /** MIME type requested from the provider (default audio/mpeg). */
    mimeType?: string;
}

export interface AudioResult {
    /** Base64-encoded audio bytes. */
    audioBase64: string;
    mimeType: string;
    prompt: string;
}

export interface Model3dGenerateOptions {
    /** When true, return a textured model (Meshy refine / fal full mode). Default true. */
    textured?: boolean;
    /** Preferred download format when the provider supports several. */
    format?: 'glb' | 'fbx' | 'obj' | 'usdz';
}

export interface Model3dResult {
    url: string;
    format: string;
    prompt: string;
    thumbnailUrl?: string;
}

export interface MoteurAIAdapter {
    generate(prompt: string, options?: GenerateOptions): Promise<string>;
    generateStructured?<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T>;
    embed?(text: string): Promise<number[]>;
    analyseImage?(imageUrl: string, prompt: string, options?: GenerateOptions): Promise<string>;
    generateImage?(prompt: string, options?: ImageGenerateOptions): Promise<ImageResult[]>;
    generateAudio?(prompt: string, options?: AudioGenerateOptions): Promise<AudioResult[]>;
    generateModel3d?(prompt: string, options?: Model3dGenerateOptions): Promise<Model3dResult[]>;
}
