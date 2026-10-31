import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveEmailSettings, type ResolvedEmailSettings } from './settings.js';

/**
 * Getting mail out: the SMTP server from the environment (SMTP_*), an optional DKIM key the
 * engine signs with itself (MOTEUR_DKIM_*), and the headers every automated email carries.
 */

export type MailCategory = 'auth' | 'notification' | 'project' | 'test';

export interface OutgoingMail {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    replyTo?: string;
    /** A different display name on the operator's address (a project's own mail). */
    fromName?: string;
    category: MailCategory;
    /** Notifications only: one-click unsubscribe (RFC 8058). */
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

/** DKIM signing by the engine, when the operator gave a key; else the mail service signs (or nobody). */
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
    // A key pasted into one line of an environment variable, with \n for its line breaks.
    privateKey = privateKey.replace(/\\n/g, '\n');
    return { domainName, keySelector, privateKey };
}

/** Why mail can't go out, or null. */
export function mailUnavailable(settings = resolveEmailSettings()): string | null {
    if (!process.env.SMTP_HOST?.trim())
        return 'Email is not set up on this server (SMTP_HOST and SMTP_FROM).';
    if (!settings.fromAddress)
        return 'Email has no From address (SMTP_FROM, or the operator’s fromAddress).';
    return null;
}

export const domainOf = (address: string) => address.split('@').pop()?.toLowerCase() ?? '';

/** A display name safe in a header: no quotes or angle brackets to break out of it. */
const displayName = (name: string) => `"${name.replace(/["\\<>\r\n]/g, '').trim()}"`;

/** The message as nodemailer takes it: headers for automated mail, the logo attached inline. */
export function buildMessage(mail: OutgoingMail, settings: ResolvedEmailSettings) {
    const domain = domainOf(settings.fromAddress);
    const headers: Record<string, string> = {
        // Automated: out-of-office replies and auto-responders should not answer it (RFC 3834).
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply'
    };
    if (mail.category === 'notification' && mail.unsubscribe) {
        headers['List-Unsubscribe'] = `<${mail.unsubscribe}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    const returnPath = process.env.SMTP_RETURN_PATH?.trim();
    return {
        from: `${displayName(mail.fromName || settings.fromName)} <${settings.fromAddress}>`,
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
        // A slow mail server must not hold requests open.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(process.env.SMTP_USER && process.env.SMTP_PASS
            ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
            : {}),
        ...(dkim && { dkim })
    });
}

/** Sends one email. Throws with a readable reason (not set up, refused by the server). */
export async function deliver(mail: OutgoingMail): Promise<{ messageId: string }> {
    const settings = resolveEmailSettings();
    const unavailable = mailUnavailable(settings);
    if (unavailable) throw new Error(unavailable);
    const transporter = await createTransport();
    const message = buildMessage(mail, settings);
    await transporter.sendMail(message);
    return { messageId: message.messageId };
}
