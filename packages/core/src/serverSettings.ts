import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';

/**
 * Settings an operator changes for the whole server while it runs, kept beside the users file
 * (`server-settings.json`). Each one can also come from the environment; a saved setting wins.
 * For now: where the Terms and the Privacy policy are (`MOTEUR_TERMS_URL`, `MOTEUR_PRIVACY_URL`),
 * which the sign-up page links to.
 */
export type ServerSettings = { termsUrl?: string; privacyUrl?: string };
export type ServerSettingsPatch = { [K in keyof ServerSettings]?: string | null };

const KEYS = ['termsUrl', 'privacyUrl'] as const;
const ENV: Record<(typeof KEYS)[number], string> = {
    termsUrl: 'MOTEUR_TERMS_URL',
    privacyUrl: 'MOTEUR_PRIVACY_URL'
};

const file = () => privateStatePath('server-settings.json');

/** An address a page may link to: https, or plain http on this machine (for development). */
export function linkableUrl(value: string): boolean {
    if (value.length > 2000) return false;
    try {
        const url = new URL(value);
        if (url.protocol === 'https:') return Boolean(url.hostname);
        return (
            url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        );
    } catch {
        return false;
    }
}

const warned = new Set<string>();

/** The settings from the environment that can be used; the others are said once in the log. */
export function envServerSettings(): ServerSettings {
    const out: ServerSettings = {};
    for (const key of KEYS) {
        const raw = process.env[ENV[key]]?.trim();
        if (!raw) continue;
        if (linkableUrl(raw)) out[key] = raw;
        else if (!warned.has(`${ENV[key]}=${raw}`)) {
            warned.add(`${ENV[key]}=${raw}`);
            console.warn(`[moteur] ${ENV[key]} is ignored: it must be an absolute https address.`);
        }
    }
    return out;
}

/** What the operator saved (not the environment). */
export function readServerSettings(): ServerSettings {
    const raw = readPrivateState<Record<string, unknown>>(file(), {});
    const out: ServerSettings = {};
    for (const key of KEYS) {
        const value = raw?.[key];
        if (typeof value === 'string' && linkableUrl(value)) out[key] = value;
    }
    return out;
}

/**
 * Change saved settings: a string sets one, null clears it (the environment's applies again).
 * A string that isn't an https address is refused (400 `URL_INVALID`), and nothing is saved.
 */
export function updateServerSettings(patch: ServerSettingsPatch): ServerSettings {
    const next = readServerSettings();
    for (const key of KEYS) {
        if (!(key in patch)) continue;
        const value = patch[key];
        if (value === null) {
            delete next[key];
            continue;
        }
        const url = typeof value === 'string' ? value.trim() : '';
        if (!linkableUrl(url))
            throw Object.assign(new Error(`${key} must be an absolute https address.`), {
                status: 400,
                code: 'URL_INVALID'
            });
        next[key] = url;
    }
    writePrivateState(file(), next);
    return next;
}

/**
 * The legal pages a sign-up page links to: the saved setting, else the environment's. A key is
 * left out when neither has it. Never throws: a broken settings file leaves the environment's.
 */
export function legalLinks(): { terms?: string; privacy?: string } {
    let saved: ServerSettings = {};
    try {
        saved = readServerSettings();
    } catch (err) {
        console.error(
            '[moteur] Server settings could not be read:',
            err instanceof Error ? err.message : err
        );
    }
    const settings = { ...envServerSettings(), ...saved };
    return {
        ...(settings.termsUrl && { terms: settings.termsUrl }),
        ...(settings.privacyUrl && { privacy: settings.privacyUrl })
    };
}
