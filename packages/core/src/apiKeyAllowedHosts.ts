/**
 * Normalize and validate API key allowed host patterns (exact host or single leading *. wildcard).
 */

export type ApiKeyHostCheckResult =
    | { ok: true }
    | { ok: false; reason: 'missing_origin' | 'invalid_origin' | 'no_match' };

function firstHeader(v: string | string[] | undefined): string | undefined {
    if (v === undefined) return undefined;
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' ? s : undefined;
}

/**
 * Trim, lowercase host patterns; accept optional https URL form for exact hosts only (no wildcards in URL form).
 */
export function normalizeAllowedHostInput(raw: string): string {
    const t = raw.trim();
    if (!t) {
        throw new Error('Empty host pattern');
    }
    const lower = t.toLowerCase();
    if (lower.includes('://')) {
        let u: URL;
        try {
            u = new URL(t);
        } catch {
            throw new Error('Invalid URL');
        }
        if (u.username || u.password) {
            throw new Error('Host pattern URL must not include credentials');
        }
        if ((u.pathname && u.pathname !== '/') || u.search || u.hash) {
            throw new Error('Host pattern must not include path or query');
        }
        const h = u.hostname;
        if (h.includes('*')) {
            throw new Error('Wildcard patterns cannot use URL form; use *.example.com');
        }
        return h;
    }
    if (t.includes('/') || t.includes('?') || t.includes('#')) {
        throw new Error('Host pattern must not include path or query');
    }
    return lower;
}

function validateSinglePattern(normalized: string): void {
    const starCount = (normalized.match(/\*/g) ?? []).length;
    if (starCount === 0) {
        return;
    }
    if (starCount > 1 || !normalized.startsWith('*.') || normalized.length < 3) {
        throw new Error('Invalid wildcard: use a single leading *., e.g. *.my-project.vercel.com');
    }
    const rest = normalized.slice(2);
    if (!rest || rest.includes('*')) {
        throw new Error('Invalid wildcard host pattern');
    }
}

/**
 * Validates an array of raw pattern strings (throws on duplicate or invalid).
 */
export function validateAllowedHostPatterns(patterns: unknown): string[] {
    if (!Array.isArray(patterns)) {
        throw new Error('allowedHosts must be an array');
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of patterns) {
        if (typeof raw !== 'string') {
            throw new Error('Each allowed host must be a string');
        }
        const p = normalizeAllowedHostInput(raw);
        validateSinglePattern(p);
        if (seen.has(p)) {
            throw new Error(`Duplicate host pattern: ${p}`);
        }
        seen.add(p);
        out.push(p);
    }
    return out;
}

/**
 * True if request hostname matches pattern (pattern already normalized).
 */
export function hostMatchesPattern(hostname: string, pattern: string): boolean {
    const h = hostname.trim().toLowerCase();
    const p = pattern.toLowerCase();
    if (!p.startsWith('*.')) {
        return h === p;
    }
    const suffix = p.slice(2);
    if (!suffix) {
        return false;
    }
    if (h === suffix) {
        return false;
    }
    if (!h.endsWith('.' + suffix)) {
        return false;
    }
    const prefix = h.slice(0, h.length - suffix.length - 1);
    if (!prefix || prefix.includes('.')) {
        return false;
    }
    return true;
}

export function hostnameMatchesAnyAllowed(hostname: string, patterns: string[]): boolean {
    return patterns.some(p => hostMatchesPattern(hostname, p));
}

/**
 * Prefer Origin, then Referer. Strict: missing or unparseable → not ok.
 */
export function requestHostMatchesAllowed(
    headers: { origin?: string | string[]; referer?: string | string[] },
    patterns: string[]
): ApiKeyHostCheckResult {
    if (!patterns.length) {
        return { ok: true };
    }
    const origin = firstHeader(headers.origin)?.trim();
    const referer = firstHeader(headers.referer)?.trim();
    const urlString = origin || referer;
    if (!urlString || urlString === 'null') {
        return { ok: false, reason: 'missing_origin' };
    }
    try {
        const hostname = new URL(urlString).hostname;
        if (!hostname) {
            return { ok: false, reason: 'invalid_origin' };
        }
        if (hostnameMatchesAnyAllowed(hostname, patterns)) {
            return { ok: true };
        }
        return { ok: false, reason: 'no_match' };
    } catch {
        return { ok: false, reason: 'invalid_origin' };
    }
}
