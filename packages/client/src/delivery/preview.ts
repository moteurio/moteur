export type PreviewSessionSource = {
    /** Read preview token from query string (e.g. `?preview=`). */
    search?: string;
    /** Read from cookie value (name defaults to `moteur_preview`). */
    cookie?: string;
    cookieName?: string;
};

const COOKIE_DEFAULT = 'moteur_preview';

export function readPreviewTokenFromSource(source: PreviewSessionSource = {}): string | undefined {
    if (source.search) {
        const params = new globalThis.URLSearchParams(
            source.search.startsWith('?') ? source.search.slice(1) : source.search
        );
        const q = params.get('preview')?.trim();
        if (q) return q;
    }
    if (source.cookie) {
        const name = source.cookieName ?? COOKIE_DEFAULT;
        const parts = source.cookie.split(';').map(s => s.trim());
        for (const part of parts) {
            const eq = part.indexOf('=');
            if (eq < 0) continue;
            if (part.slice(0, eq) === name) {
                const v = decodeURIComponent(part.slice(eq + 1)).trim();
                if (v) return v;
            }
        }
    }
    return undefined;
}

export function createPreviewSession(source: PreviewSessionSource = {}) {
    const token = readPreviewTokenFromSource(source);
    return {
        token,
        active: Boolean(token)
    };
}
