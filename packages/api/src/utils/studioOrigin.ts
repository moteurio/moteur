import { URL } from 'url';

function allowedOrigins(): Set<string> {
    return new Set(
        [process.env.STUDIO_URL, process.env.CORS_ORIGINS]
            .flatMap(v => (v ?? '').split(','))
            .map(s => s.trim().replace(/\/$/, ''))
            .filter(Boolean)
    );
}

/** Returns the admin client origin to link to: the caller's `appUrl` when it is an allowed origin, otherwise STUDIO_URL, or null when neither is known. */
export function studioOrigin(appUrl: unknown): string | null {
    const allowed = allowedOrigins();
    if (typeof appUrl === 'string') {
        try {
            const origin = new URL(appUrl).origin;
            if (allowed.has(origin)) return origin;
        } catch {
            // The URL is invalid, so fall back to STUDIO_URL.
        }
    }
    const configured = process.env.STUDIO_URL?.split(',')[0]?.trim().replace(/\/$/, '');
    return configured || null;
}
