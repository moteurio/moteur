import fs from 'node:fs';
import path from 'node:path';
import { designFor, renderHtml, renderText, type Brand } from './layout.js';
import {
    resolveEmailSettings,
    type EmailLocale,
    type EmailLook,
    type ResolvedEmailSettings
} from './settings.js';
import {
    defaultTagline,
    TEMPLATES,
    VARIANT_KINDS,
    type EmailData,
    type EmailKind,
    type EmailVariant
} from './templates.js';
import type { User } from '@moteurio/types/User.js';

export interface RenderOptions {
    /** The reader's language, as known (`fr-CA`, `en`…); else the operator's default. */
    locale?: string;
    /** The reader's look, used when the operator lets it follow the reader. */
    look?: EmailLook;
    /** Force a look (previews). */
    forceLook?: EmailLook;
    /** For the first-contact emails (invitation, welcome, form confirmation): which of two ways. */
    variant?: EmailVariant;
    settings?: ResolvedEmailSettings;
    /** How a logo file goes in: as an attachment (`cid`, for sending) or inline data (previews). */
    images?: 'cid' | 'data';
}

export interface RenderedEmail {
    kind: EmailKind;
    subject: string;
    preheader: string;
    html: string;
    text: string;
    look: EmailLook;
    design: string;
    /** First-contact emails only. */
    variant?: EmailVariant;
    locale: EmailLocale;
    /** Notifications only. */
    unsubscribe?: string;
    attachments: { filename: string; content: Buffer; cid: string; contentType: string }[];
}

/** The reader's language and look, from what the server knows of them. */
export function readerOf(user: Pick<User, 'preferences' | 'signup'> | undefined): {
    locale?: string;
    look?: EmailLook;
} {
    return {
        locale: user?.preferences?.locale ?? user?.signup?.locale,
        look: user?.preferences?.look
    };
}

/** The way first-contact emails are set until the owner picks one (see the email lab). */
export const DEFAULT_VARIANT: EmailVariant = 'a';

export const LOGO_CID = 'logo@moteur';

export function emailLocale(locale: string | undefined, fallback: EmailLocale): EmailLocale {
    const l = locale?.trim().toLowerCase() ?? '';
    if (l.startsWith('fr')) return 'fr';
    if (l.startsWith('en')) return 'en';
    return fallback;
}

export function emailLook(settings: ResolvedEmailSettings, reader?: EmailLook): EmailLook {
    return settings.look === 'recipient' ? (reader ?? 'discotheque') : settings.look;
}

function logo(settings: ResolvedEmailSettings, images: 'cid' | 'data') {
    if (settings.logoFile) {
        try {
            const content = fs.readFileSync(settings.logoFile);
            const ext = path.extname(settings.logoFile).slice(1).toLowerCase();
            const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            const attachment = {
                filename: `logo.${ext}`,
                content,
                cid: LOGO_CID,
                contentType
            };
            return images === 'cid'
                ? { src: `cid:${LOGO_CID}`, attachment }
                : { src: `data:${contentType};base64,${content.toString('base64')}` };
        } catch (err) {
            console.warn('[moteur] The email logo could not be read:', (err as Error).message);
        }
    }
    if (settings.logoUrl) return { src: settings.logoUrl };
    return null;
}

/** One email, ready to send: subject, HTML and plain text in the reader's language and look. */
export function renderEmail<K extends EmailKind>(
    kind: K,
    data: EmailData[K],
    options: RenderOptions = {}
): RenderedEmail {
    const settings = options.settings ?? resolveEmailSettings();
    const locale = emailLocale(options.locale, settings.locale);
    const look = options.forceLook ?? emailLook(settings, options.look);
    const design = designFor(look);
    const variant = VARIANT_KINDS.includes(kind) ? (options.variant ?? DEFAULT_VARIANT) : undefined;
    const content = TEMPLATES[kind](data, {
        locale,
        product: settings.productName,
        tagline: settings.productTagline?.[locale] ?? defaultTagline(locale, settings.productName),
        supportUrl: settings.supportUrl,
        variant: variant ?? DEFAULT_VARIANT
    });
    const image = logo(settings, options.images ?? 'cid');
    const brand: Brand = {
        productName: settings.productName,
        accent: settings.accent,
        logo: image ? { src: image.src, width: settings.logoWidth } : undefined,
        footer: settings.footer,
        supportUrl: settings.supportUrl
    };
    const html = renderHtml(content, design, brand, locale);
    const usesLogo = !content.sender && image && 'attachment' in image && image.attachment;
    return {
        kind,
        subject: content.subject,
        preheader: content.preheader,
        html,
        text: renderText(content, brand, locale),
        look,
        design: design.id,
        ...(variant && { variant }),
        locale,
        ...(content.unsubscribe && { unsubscribe: content.unsubscribe.href }),
        attachments: usesLogo ? [image.attachment!] : []
    };
}
