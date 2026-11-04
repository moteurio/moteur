import { URL } from 'url';

function allowedOrigins(): Set<string> {
    return new Set(
        [process.env.STUDIO_URL, process.env.CORS_ORIGINS]
            .flatMap(v => (v ?? '').split(','))
            .map(s => s.trim().replace(/\/$/, ''))
            .filter(Boolean)
    );
}

/** The Studio to link to: the caller's, when it is one we serve, else STUDIO_URL; null when unknown. */
export function studioOrigin(appUrl: unknown): string | null {
    const allowed = allowedOrigins();
    if (typeof appUrl === 'string') {
        try {
            const origin = new URL(appUrl).origin;
            if (allowed.has(origin)) return origin;
        } catch {
            // fall through
        }
    }
    const configured = process.env.STUDIO_URL?.split(',')[0]?.trim().replace(/\/$/, '');
    return configured || null;
}
