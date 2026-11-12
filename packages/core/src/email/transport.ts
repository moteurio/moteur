import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveEmailSettings, type ResolvedEmailSettings } from './settings.js';

/**
 * Sends mail: the SMTP server comes from the environment (SMTP_*), an optional DKIM key lets
 * the engine sign mail itself (MOTEUR_DKIM_*), and every automated email carries the headers set here.
 */

export type MailCategory = 'auth' | 'notification' | 'project' | 'test';

export interface OutgoingMail {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    /** A different display name on the operator's address (used for mail a project sends). */
    fromName?: string;
    /**
     * A project's own From address. It is used only when its domain is in the operator's
     * `sendingDomains`; otherwise mail is sent from the server's address with the project's name.
     */
    fromAddress?: string;
    category: MailCategory;
    /** For notifications only: one-click unsubscribe (RFC 8058). */
    unsubscribe?: string;
    attachments?: { filename: string; content: Buffer; cid: string; contentType: string }[];
}

export interface DkimConfig {
    domainName: string;
    keySelector: string;
    privateKey: string;
}

export function smtpPort(): number {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    return Number.isNaN(port) ? 587 : port;
}

/** DKIM signing by the engine when the operator provided a key. Otherwise the mail service signs the mail, or it is unsigned. */
export function dkimConfig(): DkimConfig | null {
    const domainName = process.env.MOTEUR_DKIM_DOMAIN?.trim();
    const keySelector = process.env.MOTEUR_DKIM_SELECTOR?.trim();
    let privateKey = process.env.MOTEUR_DKIM_PRIVATE_KEY?.trim();
    const keyFile = process.env.MOTEUR_DKIM_PRIVATE_KEY_FILE?.trim();
    if (!privateKey && keyFile) {
        try {
            privateKey = fs.readFileSync(keyFile, 'utf8').trim();
        } catch (err) {
            console.warn('[moteur] The DKIM key file could not be read:', (err as Error).message);
        }
    }
    if (!domainName || !keySelector || !privateKey) return null;
    // The key may be set on one line of an environment variable, with \n for line breaks.
    privateKey = privateKey.replace(/\\n/g, '\n');
    return { domainName, keySelector, privateKey };
}

/** Returns the reason mail can't be sent, or null when it can. */
export function mailUnavailable(settings = resolveEmailSettings()): string | null {
    if (!process.env.SMTP_HOST?.trim())
        return 'Email is not set up on this server (SMTP_HOST and SMTP_FROM).';
    if (!settings.fromAddress)
        return 'Email has no From address (SMTP_FROM, or the operator’s fromAddress).';
    return null;
}

export const domainOf = (address: string) => address.split('@').pop()?.toLowerCase() ?? '';

/** Sanitizes a display name for use in a header by removing quotes and angle brackets. */
const displayName = (name: string) => `"${name.replace(/["\\<>\r\n]/g, '').trim()}"`;

/** Builds the message in the shape nodemailer expects: automated-mail headers and the logo attached inline. */
export function buildMessage(mail: OutgoingMail, settings: ResolvedEmailSettings) {
    const fromAddress =
        mail.fromAddress && settings.sendingDomains.includes(domainOf(mail.fromAddress))
            ? mail.fromAddress
            : settings.fromAddress;
    const domain = domainOf(fromAddress);
    const headers: Record<string, string> = {
        // Mark the mail as automated so out-of-office replies and auto-responders don't answer it
        // (RFC 3834).
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply'
    };
    if (mail.category === 'notification' && mail.unsubscribe) {
        headers['List-Unsubscribe'] = `<${mail.unsubscribe}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    const returnPath = process.env.SMTP_RETURN_PATH?.trim();
    return {
        from: `${displayName(mail.fromName || settings.fromName)} <${fromAddress}>`,
        to: mail.to.join(', '),
        subject: mail.subject,
        text: mail.text,
        ...(mail.html && { html: mail.html }),
        ...((mail.replyTo || settings.replyTo) && { replyTo: mail.replyTo || settings.replyTo }),
        messageId: `<${randomUUID()}@${domain || 'localhost'}>`,
        date: new Date(),
        headers,
        ...(mail.attachments?.length && {
            attachments: mail.attachments.map(a => ({
                ...a,
                contentDisposition: 'inline' as const
            }))
        }),
        ...(returnPath && {
            envelope: { from: returnPath, to: mail.to }
        })
    };
}

export async function createTransport() {
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer?.default) throw new Error('Email is not available (nodemailer is missing).');
    const port = smtpPort();
    const dkim = dkimConfig();
    return nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        // Time out so a slow mail server can't hold requests open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(process.env.SMTP_USER && process.env.SMTP_PASS
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {}),
        ...(dkim && { dkim })
    });
}

/** Sends one email. Throws with a readable reason, such as mail not being configured or the server refusing it. */
export async function deliver(mail: OutgoingMail): Promise<{ messageId: string }> {
    const settings = resolveEmailSettings();
    const unavailable = mailUnavailable(settings);
    if (unavailable) throw new Error(unavailable);
    const transporter = await createTransport();
    const message = buildMessage(mail, settings);
    await transporter.sendMail(message);
    return { messageId: message.messageId };
}
