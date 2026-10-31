import fs from 'node:fs';
import path from 'node:path';
import { storageConfig } from '../config/storageConfig.js';
import { contrast, isHex } from './colour.js';

/**
 * How the server's emails look and who they come from: the operator's to set (`PATCH
 * /operator/email`, or `moteur-email set`), kept in `data/operator/email.json`. Credentials stay
 * in the environment (SMTP_*, MOTEUR_DKIM_*), never in this file.
 */

export const EMAIL_LOOKS = ['discotheque', 'folio'] as const;
export type EmailLook = (typeof EMAIL_LOOKS)[number];
export const EMAIL_LOCALES = ['en', 'fr'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export interface EmailSettings {
    /** The name people see the mail come from. Default: the name in SMTP_FROM, else the product name. */
    fromName?: string;
    /** The address mail comes from. Default: the address in SMTP_FROM. */
    fromAddress?: string;
    /** Where replies go, when not to the From address. Invitations reply to the person who invited. */
    replyTo?: string;
    /** The name the emails say: "Moteur" unless the operator renames it. */
    productName?: string;
    /** Discothèque, Folio, or `recipient`: the look the person chose, Discothèque when unknown. */
    look?: EmailLook | 'recipient';
    /** Buttons and links, as `#RRGGBB`: white text on it must read at 4.5:1. Default: the look's. */
    accent?: string;
    /** An HTTPS image shown at the top in place of the product name (not loaded until the reader allows). */
    logoUrl?: string;
    /** A PNG, JPEG or GIF on the server (at most 100 KB), sent inside each email in place of the name. */
    logoFile?: string;
    /** Width the logo is shown at, in pixels (default 120, at most 300). */
    logoWidth?: number;
    /** A line at the foot of every email: the sender's postal address or legal line. */
    footer?: string;
    /** A page where people get help, linked at the foot. */
    supportUrl?: string;
    /** The language of an email when the reader's isn't known. */
    locale?: EmailLocale;
}

export type StoredEmailSettings = EmailSettings & { updatedAt?: string; updatedBy?: string };

/** Settings as every email uses them: the file, then SMTP_FROM, then defaults. */
export interface ResolvedEmailSettings {
    fromName: string;
    fromAddress: string;
    replyTo?: string;
    productName: string;
    look: EmailLook | 'recipient';
    accent?: string;
    logoUrl?: string;
    logoFile?: string;
    logoWidth: number;
    footer?: string;
    supportUrl?: string;
    locale: EmailLocale;
}

const KEYS: (keyof EmailSettings)[] = [
    'fromName',
    'fromAddress',
    'replyTo',
    'productName',
    'look',
    'accent',
    'logoUrl',
    'logoFile',
    'logoWidth',
    'footer',
    'supportUrl',
    'locale'
];

export const LOGO_MAX_BYTES = 100 * 1024;
const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

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

/** `Name <address>` or a bare address, as SMTP_FROM holds it. */
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
        look: stored.look ?? 'discotheque',
        accent: stored.accent && accentProblem(stored.accent) === null ? stored.accent : undefined,
        logoUrl: stored.logoUrl || undefined,
        logoFile: stored.logoFile || undefined,
        logoWidth: Math.min(300, Math.max(24, Math.round(stored.logoWidth ?? 120))),
        footer: stored.footer?.trim() || undefined,
        supportUrl: stored.supportUrl || undefined,
        locale: stored.locale ?? 'en'
    };
}

/** Why an accent can't be used, or null: white text on it, and it as a link on white, at 4.5:1. */
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

/** Checks one change; throws a readable 400 when a value can't be used. */
export function validateEmailSettings(patch: Record<string, unknown>): Partial<EmailSettings> {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(patch)) {
        if (!KEYS.includes(key as keyof EmailSettings)) throw problem(`Unknown setting: ${key}`);
        // null or '' clears a setting: it falls back to its default.
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
            case 'locale':
                if (!EMAIL_LOCALES.includes(raw as EmailLocale))
                    throw problem('locale must be en or fr');
                out[key] = raw;
                break;
        }
    }
    return out as Partial<EmailSettings>;
}

/** Saves a change (null clears a setting) and returns what is stored. */
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
