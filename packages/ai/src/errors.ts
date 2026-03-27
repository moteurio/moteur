/**
 * Structured errors for the AI layer.
 * Used by the API to return 402/422 with specific codes.
 */

export type AIErrorCode =
    | 'insufficient_credits'
    | 'image_provider_not_configured'
    | 'not_implemented';

export interface AIErrorDetails {
    required?: number;
    remaining?: number;
}

export class AIError extends Error {
    readonly code: AIErrorCode;
    readonly details?: AIErrorDetails;

    constructor(code: AIErrorCode, details?: AIErrorDetails) {
        const message =
            code === 'insufficient_credits'
                ? `Insufficient credits (required: ${details?.required ?? 0}, remaining: ${details?.remaining ?? 0})`
                : code === 'image_provider_not_configured'
                  ? 'Image provider is not configured. Set it in Settings → AI.'
                  : code === 'not_implemented'
                    ? 'This operation is not implemented by this provider.'
                    : code;
        super(message);
        this.name = 'AIError';
        this.code = code;
        this.details = details;
    }
}

/** Thrown when an adapter does not implement a method (e.g. Anthropic generateImage). */
export class NotImplementedError extends Error {
    constructor(message = 'This operation is not implemented.') {
        super(message);
        this.name = 'NotImplementedError';
    }
}
