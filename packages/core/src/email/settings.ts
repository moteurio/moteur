import fs from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../config/storageConfig.js';
import { contrast, isHex } from './colour.js';

/**
 * Settings for how the server's emails look and who they come from. An operator sets them
 * (`PATCH /operator/email`, or `moteur-email set`) and they are stored in
 * `data/operator/email.json`. Credentials stay in the environment (SMTP_*, MOTEUR_DKIM_*), never
 * in this file.
 */

export const EMAIL_LOOKS = ['discotheque', 'folio'] as const;
export type EmailLook = (typeof EMAIL_LOOKS)[number];
export const EMAIL_LOCALES = ['en', 'fr'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/**
 * Reads the look a client requests (a request's `look`): Discothèque or Folio, anything else is
 * ignored. It applies only to the email sent in response to that request and is never stored.
 */
export function pageLook(value: unknown): EmailLook | undefined {
    return EMAIL_LOOKS.includes(value as EmailLook) ? (value as EmailLook) : undefined;
}

export interface EmailSettings {
    /** The sender name recipients see. Default: the name in SMTP_FROM, else the product name. */
    fromName?: string;
    /** The From address. Default: the address in SMTP_FROM. */
    fromAddress?: string;
    /** Where replies go when it isn't the From address. Replies to invitations go to the inviter. */
    replyTo?: string;
    /** The product name used in emails. Default: "Moteur". */
    productName?: string;
    /**
     * A sentence or two describing the product, used in emails that are someone's first contact
     * (invitation, welcome, sign-up). Either one text for every language, or `{ en, fr }`.
     * Default: a generic description that includes the product name.
     */
    productTagline?: string | ProductTagline;
    /**
     * `recipient` (the default): each email uses the look its reader chose (see docs/Email.md for
     * which look each email takes). `discotheque` or `folio`: every email uses that look.
     */
    look?: EmailLook | 'recipient';
    /** The look used when the reader's choice isn't known (such as an invitation to a new address). Default: Discothèque. */
    defaultLook?: EmailLook;
    /** Color of buttons and links, as `#RRGGBB`. White text on it must have a 4.5:1 contrast. Default: the look's own color. */
    accent?: string;
    /** An HTTPS image shown at the top in place of the product name. Mail clients may not load it until the reader allows remote images. */
    logoUrl?: string;
    /** A PNG, JPEG or GIF stored on the server (at most 100 KB), attached to each email in place of the name. */
    logoFile?: string;
    /** Display width of the logo in pixels (default 120, maximum 300). */
    logoWidth?: number;
    /** A line in the footer of every email, such as the sender's postal address or a legal notice. */
    footer?: string;
    /** A help page, linked in the footer. */
    supportUrl?: string;
    /** The email language used when the reader's language isn't known. */
    locale?: EmailLocale;
    /**
     * Domains a project may use as the From address for its mail (such as form confirmations), in
     * addition to the server's address. A domain is added only when its DNS passes the check (SPF,
     * DMARC, a DKIM key).
     */
    sendingDomains?: string[];
    /**
     * A small "Sent with {productName}" line in the footer of mail that projects send. Default:
     * off, or `MOTEUR_EMAIL_PROJECT_CREDIT` when the host sets it.
     */
    projectCredit?: boolean;
}

/** A tagline per language. A missing language falls back to the default tagline. */
export type ProductTagline = Partial<Record<EmailLocale, string>>;

export type StoredEmailSettings = EmailSettings & { updatedAt?: string; updatedBy?: string };

/** The effective settings, resolved in order from the settings file, then SMTP_FROM, then defaults. */
export interface ResolvedEmailSettings {
    fromName: string;
    fromAddress: string;
    replyTo?: string;
    productName: string;
    productTagline?: ProductTagline;
    look: EmailLook | 'recipient';
    defaultLook: EmailLook;
    accent?: string;
    logoUrl?: string;
    logoFile?: string;
    logoWidth: number;
    footer?: string;
    supportUrl?: string;
    locale: EmailLocale;
    sendingDomains: string[];
    projectCredit: boolean;
}

const KEYS: (keyof EmailSettings)[] = [
    'fromName',
    'fromAddress',
    'replyTo',
    'productName',
    'productTagline',
    'look',
    'defaultLook',
    'accent',
    'logoUrl',
    'logoFile',
    'logoWidth',
    'footer',
    'supportUrl',
    'locale',
    'sendingDomains',
    'projectCredit'
];

export const LOGO_MAX_BYTES = 100 * 1024;
export const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const SENDING_DOMAINS_MAX = 20;

/** Normalizes a domain for the allow-list: lower case, no trailing dot. Returns null if it isn't a valid domain. */
export function cleanDomain(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const d = value.trim().toLowerCase().replace(/\.$/, '');
    return DOMAIN.test(d) ? d : null;
}

export function settingsFile(): string {
    return path.join(storageConfig.dataRoot, 'data', 'operator', 'email.json');
}

export function readEmailSettings(): StoredEmailSettings {
    try {
        const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as StoredEmailSettings;
        return raw && typeof raw === 'object' ? raw : {};
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
            console.warn('[moteur] Email settings could not be read:', (err as Error).message);
        return {};
    }
}

/** Parses `Name <address>` or a bare address, the formats SMTP_FROM accepts. */
export function parseMailbox(value: string | undefined): { name?: string; address?: string } {
    const v = (value ?? '').trim();
    if (!v) return {};
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim() || undefined, address: m[2].trim() };
    return { address: v };
}

export function resolveEmailSettings(
    stored: StoredEmailSettings = readEmailSettings()
): ResolvedEmailSettings {
    const env = parseMailbox(process.env.SMTP_FROM);
    const productName = stored.productName?.trim() || 'Moteur';
    return {
        fromName: stored.fromName?.trim() || env.name || productName,
        fromAddress: stored.fromAddress?.trim() || env.address || '',
        replyTo: stored.replyTo?.trim() || undefined,
        productName,
        productTagline: taglineOf(stored.productTagline),
        look: stored.look ?? 'recipient',
        defaultLook: stored.defaultLook ?? 'discotheque',
        accent: stored.accent && accentProblem(stored.accent) === null ? stored.accent : undefined,
        logoUrl: stored.logoUrl || undefined,
        logoFile: stored.logoFile || undefined,
        logoWidth: Math.min(300, Math.max(24, Math.round(stored.logoWidth ?? 120))),
        footer: stored.footer?.trim() || undefined,
        supportUrl: stored.supportUrl || undefined,
        locale: stored.locale ?? 'en',
        sendingDomains: (stored.sendingDomains ?? [])
            .map(cleanDomain)
            .filter((d): d is string => Boolean(d)),
        // Use the setting from the file, else the host's default (`MOTEUR_EMAIL_PROJECT_CREDIT`,
        // which a hosting service can set in its deployment), else off.
        projectCredit:
            typeof stored.projectCredit === 'boolean'
                ? stored.projectCredit
                : /^(1|true|on)$/i.test(process.env.MOTEUR_EMAIL_PROJECT_CREDIT?.trim() ?? '')
    };
}

export const TAGLINE_MAX = 300;

/** Normalizes a stored tagline to one text per language. A plain string applies to every language. */
function taglineOf(value: unknown): ProductTagline | undefined {
    if (typeof value === 'string')
        return value.trim() ? { en: value.trim(), fr: value.trim() } : undefined;
    if (!value || typeof value !== 'object') return undefined;
    const out: ProductTagline = {};
    for (const l of EMAIL_LOCALES) {
        const v = (value as Record<string, unknown>)[l];
        if (typeof v === 'string' && v.trim()) out[l] = v.trim();
    }
    return Object.keys(out).length ? out : undefined;
}

/** Returns why an accent color can't be used, or null if it can. It needs a 4.5:1 contrast both with white text on it and as a link on white. */
export function accentProblem(value: string): string | null {
    if (!isHex(value)) return 'accent must be a colour like #1F5FC4';
    const onWhite = contrast(value, '#FFFFFF');
    if (onWhite < 4.5)
        return `accent is too light: white text on it reads at ${onWhite.toFixed(1)}:1, and needs 4.5:1. Try a darker shade.`;
    return null;
}

function problem(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

/** Validates one change and throws a 400 error with a readable message when a value is invalid. */
export function validateEmailSettings(patch: Record<string, unknown>): Partial<EmailSettings> {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(patch)) {
        if (!KEYS.includes(key as keyof EmailSettings)) throw problem(`Unknown setting: ${key}`);
        // null or '' clears a setting, which then falls back to its default.
        if (raw === null || raw === '') {
            out[key] = null;
            continue;
        }
        const text = (max: number) => {
            if (typeof raw !== 'string') throw problem(`${key} must be text`);
            const v = raw.trim();
            if (v.length > max) throw problem(`${key} is longer than ${max} characters`);
            if (/[\r\n]/.test(v) && key !== 'footer') throw problem(`${key} must be on one line`);
            return v;
        };
        const https = () => {
            const v = text(500);
            let url: URL;
            try {
                url = new URL(v);
            } catch {
                throw problem(`${key} must be a full address, starting with https://`);
            }
            if (url.protocol !== 'https:') throw problem(`${key} must start with https://`);
            return url.toString();
        };
        switch (key) {
            case 'fromName':
            case 'productName':
                out[key] = text(80);
                if (/[<>"@]/.test(out[key] as string))
                    throw problem(`${key} can’t hold < > " or @`);
                break;
            case 'fromAddress':
            case 'replyTo':
                out[key] = text(254);
                if (!EMAIL.test(out[key] as string))
                    throw problem(`${key} must be an email address`);
                break;
            case 'look':
                if (raw !== 'recipient' && !EMAIL_LOOKS.includes(raw as EmailLook))
                    throw problem('look must be discotheque, folio or recipient');
                out[key] = raw;
                break;
            case 'accent': {
                const v = text(7).toUpperCase();
                const why = accentProblem(v);
                if (why) throw problem(why);
                out[key] = v;
                break;
            }
            case 'logoUrl':
            case 'supportUrl':
                out[key] = https();
                break;
            case 'logoFile': {
                const v = text(1000);
                const file = path.resolve(storageConfig.dataRoot, v);
                if (!/\.(png|jpe?g|gif)$/i.test(file))
                    throw problem('logoFile must be a .png, .jpg or .gif file');
                let size: number;
                try {
                    size = fs.statSync(file).size;
                } catch {
                    throw problem(`logoFile: no file at ${file}`);
                }
                if (size > LOGO_MAX_BYTES)
                    throw problem('logoFile is over 100 KB: every email would carry it');
                out[key] = file;
                break;
            }
            case 'logoWidth':
                if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 24 || raw > 300)
                    throw problem('logoWidth must be a number of pixels, from 24 to 300');
                out[key] = Math.round(raw);
                break;
            case 'footer':
                out[key] = text(400);
                break;
            case 'productTagline': {
                const line = (v: unknown) => {
                    if (typeof v !== 'string') throw problem(`${key} must be text`);
                    const t = v.trim();
                    if (t.length > TAGLINE_MAX)
                        throw problem(`${key} is longer than ${TAGLINE_MAX} characters`);
                    if (/[\r\n]/.test(t)) throw problem(`${key} must be on one line`);
                    return t;
                };
                if (typeof raw === 'string') {
                    out[key] = line(raw);
                    break;
                }
                if (typeof raw !== 'object' || Array.isArray(raw))
                    throw problem(`${key} must be text, or { "en": "…", "fr": "…" }`);
                const per: ProductTagline = {};
                for (const [l, v] of Object.entries(raw as Record<string, unknown>)) {
                    if (!EMAIL_LOCALES.includes(l as EmailLocale))
                        throw problem(`${key} has languages en and fr only`);
                    if (v === null || v === '') continue;
                    per[l as EmailLocale] = line(v);
                }
                out[key] = Object.keys(per).length ? per : null;
                break;
            }
            case 'locale':
                if (!EMAIL_LOCALES.includes(raw as EmailLocale))
                    throw problem('locale must be en or fr');
                out[key] = raw;
                break;
            case 'defaultLook':
                if (!EMAIL_LOOKS.includes(raw as EmailLook))
                    throw problem('defaultLook must be discotheque or folio');
                out[key] = raw;
                break;
            case 'sendingDomains': {
                // Accept an array, or a comma-separated string like the CLI sends: "a.example, b.example".
                const items = typeof raw === 'string' ? raw.split(/[\s,]+/) : raw;
                if (!Array.isArray(items)) throw problem(`${key} must be a list of domains`);
                const domains = [
                    ...new Set(
                        items
                            .filter(d => d !== '')
                            .map(d => {
                                const clean = cleanDomain(d);
                                if (!clean) throw problem(`${key}: ${String(d)} is not a domain`);
                                return clean;
                            })
                    )
                ];
                if (domains.length > SENDING_DOMAINS_MAX)
                    throw problem(`${key} holds ${SENDING_DOMAINS_MAX} domains at most`);
                out[key] = domains.length ? domains : null;
                break;
            }
            case 'projectCredit':
                if (typeof raw === 'boolean') out[key] = raw;
                else if (raw === 'true' || raw === 'on') out[key] = true;
                else if (raw === 'false' || raw === 'off') out[key] = false;
                else throw problem('projectCredit must be true or false');
                break;
        }
    }
    return out as Partial<EmailSettings>;
}

/** Saves a change (null clears a setting) and returns the stored settings. */
export function saveEmailSettings(patch: Record<string, unknown>, by: string): StoredEmailSettings {
    const clean = validateEmailSettings(patch);
    const next: Record<string, unknown> = { ...readEmailSettings() };
    for (const [k, v] of Object.entries(clean)) {
        if (v === null) delete next[k];
        else next[k] = v;
    }
    next.updatedAt = new Date().toISOString();
    next.updatedBy = by;
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return next as StoredEmailSettings;
}
