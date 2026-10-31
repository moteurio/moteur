import fs from 'node:fs';
import path from 'node:path';
import { designFor, renderHtml, renderText, type Brand, type EmailStyle } from './layout.js';
import {
    resolveEmailSettings,
    type EmailLocale,
    type EmailLook,
    type ResolvedEmailSettings
} from './settings.js';
import {
    defaultTagline,
    PROJECT_KINDS,
    TEMPLATES,
    type EmailData,
    type EmailKind
} from './templates.js';
import type { User } from '@moteurio/types/User.js';

export interface RenderOptions {
    /** The reader's language, as known (`fr-CA`, `en`…); else the operator's default. */
    locale?: string;
    /** The reader's look, used when the operator lets it follow the reader. */
    look?: EmailLook;
    /** Force a look (previews). A project's own mail keeps its own. */
    forceLook?: EmailLook;
    settings?: ResolvedEmailSettings;
    /**
     * A project's own mail (form confirmations and form emails): its name, logo, colour and foot.
     * Without it, the project's name alone.
     */
    project?: ProjectBrand;
    /** How a logo file goes in: as an attachment (`cid`, for sending) or inline data (previews). */
    images?: 'cid' | 'data';
}

export interface RenderedEmail {
    kind: EmailKind;
    subject: string;
    preheader: string;
    html: string;
    text: string;
    /** The reader's look, or `project` for a project's own mail. */
    look: EmailStyle;
    design: string;
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

/**
 * A project's brand on its own mail, ready to render: the logo already read (an image from the
 * project's media) or a URL. See ./project.ts.
 */
export interface ProjectBrand {
    name: string;
    accent?: string;
    logo?: { url: string; width: number } | { content: Buffer; contentType: string; width: number };
    footer?: string;
    siteUrl?: string;
}

export const LOGO_CID = 'logo@moteur';
export const PROJECT_LOGO_CID = 'logo@project';

export function emailLocale(locale: string | undefined, fallback: EmailLocale): EmailLocale {
    const l = locale?.trim().toLowerCase() ?? '';
    if (l.startsWith('fr')) return 'fr';
    if (l.startsWith('en')) return 'en';
    return fallback;
}

/** The look an email takes: the operator's when it set one, else the reader's, else the default. */
export function emailLook(settings: ResolvedEmailSettings, reader?: EmailLook): EmailLook {
    return settings.look === 'recipient' ? (reader ?? settings.defaultLook) : settings.look;
}

/** The line some operators ask for at the foot of projects' own mail. */
export function creditLine(
    settings: ResolvedEmailSettings,
    locale: EmailLocale
): string | undefined {
    if (!settings.projectCredit) return undefined;
    return locale === 'fr'
        ? `Envoyé avec ${settings.productName}`
        : `Sent with ${settings.productName}`;
}

function projectLogo(logo: ProjectBrand['logo'], images: 'cid' | 'data') {
    if (!logo) return null;
    if ('url' in logo) return { src: logo.url, width: logo.width };
    const ext = logo.contentType === 'image/jpeg' ? 'jpg' : logo.contentType.split('/')[1];
    const attachment = {
        filename: `logo.${ext}`,
        content: logo.content,
        cid: PROJECT_LOGO_CID,
        contentType: logo.contentType
    };
    return images === 'cid'
        ? { src: `cid:${PROJECT_LOGO_CID}`, width: logo.width, attachment }
        : {
              src: `data:${logo.contentType};base64,${logo.content.toString('base64')}`,
              width: logo.width
          };
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
    const images = options.images ?? 'cid';
    // A project's own mail is the project's: its design, never the reader's look or the operator's brand.
    const ofProject = PROJECT_KINDS.includes(kind);
    const look: EmailStyle = ofProject
        ? 'project'
        : (options.forceLook ?? emailLook(settings, options.look));
    const design = designFor(look);
    const content = TEMPLATES[kind](data, {
        locale,
        product: settings.productName,
        tagline: settings.productTagline?.[locale] ?? defaultTagline(locale, settings.productName),
        supportUrl: settings.supportUrl
    });
    let brand: Brand;
    let attachment: RenderedEmail['attachments'][number] | undefined;
    if (ofProject) {
        const p = options.project ?? { name: (data as { project: string }).project };
        const image = projectLogo(p.logo, images);
        attachment = image && 'attachment' in image ? image.attachment : undefined;
        brand = {
            productName: p.name,
            accent: p.accent,
            logo: image ? { src: image.src, width: image.width } : undefined,
            footer: p.footer,
            siteUrl: p.siteUrl,
            credit: creditLine(settings, locale)
        };
    } else {
        const image = logo(settings, images);
        // Mail a project sends its own people (form notices) carries the project's name, not the logo.
        attachment =
            !content.sender && image && 'attachment' in image ? image.attachment : undefined;
        brand = {
            productName: settings.productName,
            accent: settings.accent,
            logo: image ? { src: image.src, width: settings.logoWidth } : undefined,
            footer: settings.footer,
            supportUrl: settings.supportUrl
        };
    }
    return {
        kind,
        subject: content.subject,
        preheader: content.preheader,
        html: renderHtml(content, design, brand, locale),
        text: renderText(content, brand, locale, look),
        look,
        design: design.id,
        locale,
        ...(content.unsubscribe && { unsubscribe: content.unsubscribe.href }),
        attachments: attachment ? [attachment] : []
    };
}
