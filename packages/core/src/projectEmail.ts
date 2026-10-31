import type { ProjectEmailSettings, ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import { hasRole } from '@moteurio/types';

type WithRoles = Parameters<typeof hasRole>[0];
import { getProject, updateProject } from './projects.js';
import { getAsset } from './assets/assetService.js';
import { getProjectAdapter } from './assets/adapterRegistry.js';
import {
    accentProblem,
    EMAIL,
    LOGO_MAX_BYTES,
    resolveEmailSettings,
    type EmailLocale,
    type ResolvedEmailSettings
} from './email/settings.js';
import { domainOf } from './email/transport.js';
import { creditLine, emailLocale, renderEmail, type ProjectBrand } from './email/render.js';
import { samples, type EmailData } from './email/templates.js';

/**
 * A project's own mail, to its site's visitors (form confirmations and form emails): who it comes
 * from and how it looks, kept with the project (`email` in project.json). The server's operator
 * keeps the From address unless it allows the project's domain (`sendingDomains`).
 */

export const PROJECT_EMAIL_KEYS = [
    'senderName',
    'replyTo',
    'fromAddress',
    'logoAssetId',
    'logoUrl',
    'logoWidth',
    'accent',
    'footer',
    'siteUrl'
] as const satisfies readonly (keyof ProjectEmailSettings)[];

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/gif'];

/**
 * Who may change a project's own mail: its admins, builders and developers (who set up its
 * forms), and content leads (who look after what it says). Admin implies lead and developer
 * implies builder, so two checks cover the four.
 */
export function canEditProjectEmail(user: WithRoles): boolean {
    return hasRole(user, 'builder') || hasRole(user, 'lead');
}

function problem(message: string, status = 400): Error {
    return Object.assign(new Error(message), { status });
}

/** Whether a project may send From this address: its domain is on the operator's list. */
export function fromAllowed(address: string, settings: ResolvedEmailSettings): boolean {
    return settings.sendingDomains.includes(domainOf(address));
}

/**
 * Checks a change to a project's email settings; throws a readable 400 when a value can't be
 * used. null or '' clears a setting. The logo image is checked by `saveProjectEmail` (it reads it).
 */
export function validateProjectEmail(
    patch: Record<string, unknown>,
    settings: ResolvedEmailSettings = resolveEmailSettings()
): Partial<Record<keyof ProjectEmailSettings, unknown>> {
    const out: Partial<Record<keyof ProjectEmailSettings, unknown>> = {};
    for (const [key, raw] of Object.entries(patch)) {
        if (!(PROJECT_EMAIL_KEYS as readonly string[]).includes(key))
            throw problem(`Unknown setting: ${key}`);
        const k = key as keyof ProjectEmailSettings;
        if (raw === null || raw === '') {
            out[k] = null;
            continue;
        }
        const text = (max: number, lines = false) => {
            if (typeof raw !== 'string') throw problem(`${key} must be text`);
            const v = raw.trim().replace(/\r\n?/g, '\n');
            if (v.length > max) throw problem(`${key} is longer than ${max} characters`);
            if (!lines && /\n/.test(v)) throw problem(`${key} must be on one line`);
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
        switch (k) {
            case 'senderName':
                out[k] = text(80);
                if (/[<>"@]/.test(out[k] as string)) throw problem(`${key} can’t hold < > " or @`);
                break;
            case 'replyTo':
                out[k] = text(254).toLowerCase();
                if (!EMAIL.test(out[k] as string)) throw problem(`${key} must be an email address`);
                break;
            case 'fromAddress': {
                const v = text(254).toLowerCase();
                if (!EMAIL.test(v)) throw problem(`${key} must be an email address`);
                if (!fromAllowed(v, settings))
                    throw problem(
                        settings.sendingDomains.length
                            ? `${key} must be on ${settings.sendingDomains.join(', ')}: the domains this server can send from`
                            : 'This server sends from its own address only: its operator allows no other domain'
                    );
                out[k] = v;
                break;
            }
            case 'logoAssetId':
                out[k] = text(200);
                break;
            case 'logoUrl':
            case 'siteUrl':
                out[k] = https();
                break;
            case 'logoWidth':
                if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 24 || raw > 300)
                    throw problem('logoWidth must be a number of pixels, from 24 to 300');
                out[k] = Math.round(raw);
                break;
            case 'accent': {
                const v = text(7).toUpperCase();
                const why = accentProblem(v);
                if (why) throw problem(why);
                out[k] = v;
                break;
            }
            case 'footer':
                // Kept as written, line breaks too; at most a few lines.
                out[k] = text(400, true).replace(/\n{3,}/g, '\n\n');
                break;
        }
    }
    return out;
}

/** The logo from the project's media, read to go inside each email; throws why it can't. */
async function readLogo(
    project: ProjectSchema,
    assetId: string
): Promise<{ content: Buffer; contentType: string }> {
    const asset = await getAsset(project.id, assetId);
    if (!asset?.path) throw problem('logoAssetId: no such image in the project’s media');
    if (!LOGO_TYPES.includes(asset.mimeType))
        throw problem('The logo must be a PNG, JPEG or GIF image');
    if (asset.size > LOGO_MAX_BYTES)
        throw problem('The logo is over 100 KB: every email would carry it. Use a smaller image.');
    const content = await getProjectAdapter(project).download(asset.path);
    if (content.length > LOGO_MAX_BYTES)
        throw problem('The logo is over 100 KB: every email would carry it. Use a smaller image.');
    return { content, contentType: asset.mimeType };
}

/** The stored settings with a change applied: null clears, and one logo replaces the other. */
function merged(
    current: ProjectEmailSettings | undefined,
    clean: Partial<Record<keyof ProjectEmailSettings, unknown>>
): ProjectEmailSettings {
    const next: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(clean)) {
        if (v === null) delete next[k];
        else next[k] = v;
    }
    if (clean.logoAssetId) delete next.logoUrl;
    if (clean.logoUrl) delete next.logoAssetId;
    return next as ProjectEmailSettings;
}

/** Saves a change to a project's email settings (null clears one) and returns what is stored. */
export async function saveProjectEmail(
    user: User,
    projectId: string,
    patch: Record<string, unknown>
): Promise<ProjectEmailSettings> {
    const project = await getProject(user, projectId);
    const clean = validateProjectEmail(patch);
    if (typeof clean.logoAssetId === 'string') await readLogo(project, clean.logoAssetId);
    const next = merged(project.email, clean);
    await updateProject(user, projectId, {
        email: Object.keys(next).length ? next : null
    } as unknown as Partial<ProjectSchema>);
    return next;
}

/** How a project's own mail goes out: its brand, the name inboxes show, its addresses. */
export interface ProjectMail {
    brand: ProjectBrand;
    fromName: string;
    /** Only on a domain the operator allows; else the server's own address is used. */
    fromAddress?: string;
    replyTo?: string;
}

/** A project's mail as its settings (or a draft of them) make it. A logo that can't be read is left out. */
export async function projectMailOf(
    project: ProjectSchema,
    draft?: ProjectEmailSettings,
    settings: ResolvedEmailSettings = resolveEmailSettings()
): Promise<ProjectMail> {
    const e = draft ?? project.email ?? {};
    const name = e.senderName?.trim() || project.label || project.id;
    const width = Math.min(300, Math.max(24, Math.round(e.logoWidth ?? 120)));
    let logo: ProjectBrand['logo'];
    if (e.logoAssetId) {
        try {
            logo = { ...(await readLogo(project, e.logoAssetId)), width };
        } catch (err) {
            console.warn(
                '[moteur] A project’s email logo could not be used:',
                (err as Error).message
            );
        }
    } else if (e.logoUrl) logo = { url: e.logoUrl, width };
    const site = e.siteUrl || project.siteUrl?.trim();
    return {
        brand: {
            name,
            accent: e.accent && accentProblem(e.accent) === null ? e.accent : undefined,
            logo,
            footer: e.footer?.trim() || undefined,
            siteUrl: site && /^https?:\/\//.test(site) ? site : undefined
        },
        fromName: name,
        fromAddress:
            e.fromAddress && fromAllowed(e.fromAddress, settings) ? e.fromAddress : undefined,
        replyTo: e.replyTo || undefined
    };
}

/** A project's email settings as the Studio shows them: stored, in effect, and what the server allows. */
export async function projectEmailView(project: ProjectSchema, canEdit: boolean) {
    const settings = resolveEmailSettings();
    const mail = await projectMailOf(project, undefined, settings);
    const fromAddress = mail.fromAddress ?? settings.fromAddress;
    const logo = mail.brand.logo;
    return {
        settings: project.email ?? {},
        effective: {
            senderName: mail.fromName,
            from: `"${mail.fromName.replace(/["\\]/g, '')}" <${fromAddress}>`,
            fromAddress,
            ...(mail.replyTo && { replyTo: mail.replyTo }),
            ...(mail.brand.accent && { accent: mail.brand.accent }),
            ...(mail.brand.footer && { footer: mail.brand.footer }),
            ...(mail.brand.siteUrl && { siteUrl: mail.brand.siteUrl }),
            ...(logo && {
                logo: {
                    src:
                        'url' in logo
                            ? logo.url
                            : `data:${logo.contentType};base64,${logo.content.toString('base64')}`,
                    width: logo.width
                }
            })
        },
        sendingDomains: settings.sendingDomains,
        credit: creditLine(settings, emailLocale(project.defaultLocale, settings.locale)) ?? null,
        canEdit
    };
}

/** Made-up answers for a project's preview, in its own name. */
function previewData(
    kind: 'form-confirm' | 'form-message',
    locale: EmailLocale,
    brand: ProjectBrand
): EmailData['form-confirm'] | EmailData['form-message'] {
    const fr = locale === 'fr';
    const subject = fr ? 'Merci pour votre message' : 'Thanks for your message';
    const body = fr
        ? `Merci, Marc. Votre message est bien arrivé${'\u202f'}: nous vous répondons d’ici deux jours ouvrables.\n\n${brand.name}`
        : `Thanks, Marc. Your message came through, and we’ll answer within two working days.\n\n${brand.name}`;
    if (kind === 'form-message') return { project: brand.name, subject, body };
    return {
        ...samples(locale)['form-confirm'],
        project: brand.name,
        site: brand.siteUrl,
        subject,
        body
    };
}

/** A project's form email with sample answers, as its settings (or an unsaved draft of them) make it. */
export async function previewProjectEmail(
    project: ProjectSchema,
    options: { kind?: unknown; locale?: unknown; draft?: unknown } = {}
) {
    const kind = options.kind === 'form-message' ? 'form-message' : 'form-confirm';
    const settings = resolveEmailSettings();
    const locale = emailLocale(
        typeof options.locale === 'string' ? options.locale : project.defaultLocale,
        settings.locale
    );
    let draft: ProjectEmailSettings | undefined;
    if (options.draft !== undefined && options.draft !== null) {
        if (typeof options.draft !== 'object' || Array.isArray(options.draft))
            throw problem('settings must be an object of email settings');
        draft = merged(
            project.email,
            validateProjectEmail(options.draft as Record<string, unknown>, settings)
        );
    }
    const mail = await projectMailOf(project, draft, settings);
    const email = renderEmail(kind, previewData(kind, locale, mail.brand) as never, {
        locale,
        settings,
        project: mail.brand,
        images: 'data'
    });
    const fromAddress = mail.fromAddress ?? settings.fromAddress;
    return {
        kind,
        locale,
        subject: email.subject,
        preheader: email.preheader,
        html: email.html,
        text: email.text,
        from: `"${mail.fromName.replace(/["\\]/g, '')}" <${fromAddress}>`,
        ...(mail.replyTo && { replyTo: mail.replyTo })
    };
}
