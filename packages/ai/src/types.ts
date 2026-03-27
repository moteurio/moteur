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

export interface MoteurAIAdapter {
    generate(prompt: string, options?: GenerateOptions): Promise<string>;
    generateStructured?<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T>;
    embed?(text: string): Promise<number[]>;
    analyseImage?(imageUrl: string, prompt: string, options?: GenerateOptions): Promise<string>;
    generateImage?(prompt: string, options?: ImageGenerateOptions): Promise<ImageResult[]>;
}
