import { createPrivateKey, createPublicKey } from 'node:crypto';
import dns from 'node:dns/promises';
import { renderEmail } from './render.js';
import { resolveEmailSettings } from './settings.js';
import {
    createTransport,
    deliver,
    dkimConfig,
    domainOf,
    mailUnavailable,
    smtpPort
} from './transport.js';
import { apiUrl } from './unsubscribe.js';
import { studioUrl } from '../utils/studioUrl.js';

/**
 * What an operator can check from the server about its email: the SMTP server answers, the From
 * domain publishes SPF, DMARC and a DKIM key, links point at the same domain. What it can't see
 * (whether a mailbox puts the mail in the inbox) is for the test email and a tool like
 * mail-tester.com.
 */

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';
export interface EmailCheck {
    id: string;
    status: CheckStatus;
    message: string;
    /** What was found, as is (a DNS record). */
    found?: string;
}

export interface Resolver {
    txt(name: string): Promise<string[]>;
    mx(name: string): Promise<string[]>;
}

const systemResolver: Resolver = {
    txt: async name => (await dns.resolveTxt(name)).map(parts => parts.join('')),
    mx: async name => (await dns.resolveMx(name)).map(r => r.exchange)
};

/** Selectors common mail services publish their DKIM keys under. */
export const COMMON_SELECTORS = [
    'default',
    'mail',
    'dkim',
    'email',
    's1',
    's2',
    'k1',
    'k2',
    'selector1',
    'selector2',
    'google',
    'resend',
    'pm',
    'mandrill',
    'mailjet',
    'mta',
    'smtp',
    'mx',
    'krs',
    'pic',
    'zmail'
];

/** Mailboxes whose DMARC refuses their address on mail from anyone else's server. */
const FREE_MAIL =
    /^(gmail\.com|googlemail\.com|outlook\.[a-z.]+|hotmail\.[a-z.]+|live\.[a-z.]+|msn\.com|yahoo\.[a-z.]+|ymail\.com|aol\.com|icloud\.com|me\.com|mac\.com|proton\.me|protonmail\.com|gmx\.[a-z.]+|videotron\.ca|sympatico\.ca|bell\.net|rogers\.com|shaw\.ca)$/;

/** The registrable part of a host: `mail.moteur.io` → `moteur.io` (two-part suffixes too). */
export function baseDomain(host: string): string {
    const parts = host.toLowerCase().replace(/\.$/, '').split('.');
    const twoPart = /^(co|com|net|org|gov|edu|ac|qc|on|bc|ab)\.[a-z]{2}$/;
    const n = parts.length >= 3 && twoPart.test(parts.slice(-2).join('.')) ? 3 : 2;
    return parts.slice(-n).join('.');
}

async function lookup(fn: () => Promise<string[]>): Promise<string[] | null> {
    try {
        return await fn();
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENODATA' || code === 'ENOTFOUND') return [];
        return null;
    }
}

/** The public half of the engine's DKIM key, as DNS would publish it (`p=`). */
function publicKeyOf(privateKey: string): string | null {
    try {
        const der = createPublicKey(createPrivateKey(privateKey)).export({
            type: 'spki',
            format: 'der'
        });
        return Buffer.from(der).toString('base64');
    } catch {
        return null;
    }
}

const tag = (record: string, name: string) =>
    record.match(new RegExp(`(?:^|;)\\s*${name}=([^;]*)`, 'i'))?.[1]?.trim();

export async function checkDns(
    fromDomain: string,
    options: { selectors?: string[]; resolver?: Resolver } = {}
): Promise<EmailCheck[]> {
    const r = options.resolver ?? systemResolver;
    const out: EmailCheck[] = [];

    // SPF
    const txt = await lookup(() => r.txt(fromDomain));
    const spf = (txt ?? []).filter(t => /^v=spf1\b/i.test(t));
    if (txt === null)
        out.push({ id: 'spf', status: 'warn', message: `Could not look up ${fromDomain} (DNS).` });
    else if (!spf.length)
        out.push({
            id: 'spf',
            status: 'fail',
            message: `${fromDomain} has no SPF record. Add the TXT record your mail service gives (v=spf1 include:… ~all).`
        });
    else if (spf.length > 1)
        out.push({
            id: 'spf',
            status: 'fail',
            message: `${fromDomain} has ${spf.length} SPF records: receivers treat that as none. Merge them into one.`,
            found: spf.join('\n')
        });
    else if (/[+?]all\b/i.test(spf[0]) || !/[-~]all\b/i.test(spf[0]))
        out.push({
            id: 'spf',
            status: 'warn',
            message: 'SPF found, but it lets anyone send: end it with ~all or -all.',
            found: spf[0]
        });
    else
        out.push({
            id: 'spf',
            status: 'ok',
            message:
                'SPF found. Check that it includes your mail service: only the service can say which servers send for it.',
            found: spf[0]
        });

    // DMARC: at the From domain, else at the domain it belongs to.
    let dmarcAt = `_dmarc.${fromDomain}`;
    let dmarc = ((await lookup(() => r.txt(dmarcAt))) ?? []).filter(t => /^v=DMARC1\b/i.test(t));
    const base = baseDomain(fromDomain);
    if (!dmarc.length && base !== fromDomain) {
        dmarcAt = `_dmarc.${base}`;
        dmarc = ((await lookup(() => r.txt(dmarcAt))) ?? []).filter(t => /^v=DMARC1\b/i.test(t));
    }
    if (!dmarc.length)
        out.push({
            id: 'dmarc',
            status: 'fail',
            message: `No DMARC record at _dmarc.${fromDomain}. Gmail, Yahoo and Outlook expect one: start with v=DMARC1; p=none; rua=mailto:you@${base}`
        });
    else {
        const p = tag(dmarc[0], 'p')?.toLowerCase();
        out.push(
            p === 'none'
                ? {
                      id: 'dmarc',
                      status: 'warn',
                      message: `DMARC found at ${dmarcAt}, watching only (p=none). Fine to start; move to p=quarantine once reports show your mail passes.`,
                      found: dmarc[0]
                  }
                : {
                      id: 'dmarc',
                      status: 'ok',
                      message: `DMARC found at ${dmarcAt} (p=${p ?? '?'}).`,
                      found: dmarc[0]
                  }
        );
    }

    // DKIM: the engine's own key, compared with what DNS publishes; else selectors services use.
    const own = dkimConfig();
    if (own) {
        const name = `${own.keySelector}._domainkey.${own.domainName}`;
        const records = ((await lookup(() => r.txt(name))) ?? []).filter(t => /p=/.test(t));
        const published = records[0] ? tag(records[0], 'p')?.replace(/\s+/g, '') : undefined;
        const mine = publicKeyOf(own.privateKey);
        if (!mine)
            out.push({
                id: 'dkim',
                status: 'fail',
                message: 'MOTEUR_DKIM_PRIVATE_KEY is not a private key the engine can read (PEM).'
            });
        else if (!published)
            out.push({
                id: 'dkim',
                status: 'fail',
                message: `The engine signs with selector ${own.keySelector}, but ${name} has no key. Publish: v=DKIM1; k=rsa; p=${mine}`
            });
        else if (published !== mine)
            out.push({
                id: 'dkim',
                status: 'fail',
                message: `${name} holds a different key from the one the engine signs with: receivers will fail the signature.`
            });
        else
            out.push({
                id: 'dkim',
                status: 'ok',
                message: `The engine signs with ${name}, and DNS publishes the same key.`
            });
        if (baseDomain(own.domainName) !== base)
            out.push({
                id: 'dkim-alignment',
                status: 'warn',
                message: `The engine signs as ${own.domainName}, but mail comes from ${fromDomain}: DMARC needs them to share a domain.`
            });
    } else {
        const selectors = [...new Set([...(options.selectors ?? []), ...COMMON_SELECTORS])];
        const found: string[] = [];
        await Promise.all(
            selectors.map(async s => {
                const records = (await lookup(() => r.txt(`${s}._domainkey.${fromDomain}`))) ?? [];
                if (records.some(t => /p=/.test(t))) found.push(s);
            })
        );
        out.push(
            found.length
                ? {
                      id: 'dkim',
                      status: 'ok',
                      message: `DKIM keys published under ${found.sort().join(', ')}. The engine doesn’t sign itself: check that your mail service signs as ${fromDomain}.`
                  }
                : {
                      id: 'dkim',
                      status: 'warn',
                      message: `No DKIM key found at the usual selectors for ${fromDomain}. Your mail service gives the record to publish; tell this check its selector with --selector.`
                  }
        );
    }

    // MX: a domain nobody can write back to looks like a throwaway.
    const mx = await lookup(() => r.mx(fromDomain));
    out.push(
        mx && mx.length
            ? { id: 'mx', status: 'ok', message: `${fromDomain} receives mail (${mx[0]}).` }
            : {
                  id: 'mx',
                  status: 'warn',
                  message: `${fromDomain} has no MX record: bounces and replies have nowhere to go, and some receivers refuse such mail.`
              }
    );
    return out;
}

/** The whole check: settings, SMTP, DNS, links. Sends a test email when `to` is given. */
export async function runEmailCheck(
    options: { to?: string; selectors?: string[]; resolver?: Resolver; verifySmtp?: boolean } = {}
): Promise<{ checks: EmailCheck[]; sent?: { to: string; messageId: string } }> {
    const settings = resolveEmailSettings();
    const checks: EmailCheck[] = [];
    const unavailable = mailUnavailable(settings);
    if (unavailable) checks.push({ id: 'setup', status: 'fail', message: unavailable });
    else
        checks.push({
            id: 'setup',
            status: 'ok',
            message: `Mail goes through ${process.env.SMTP_HOST}:${smtpPort()} as ${settings.fromName} <${settings.fromAddress}>.`
        });

    const fromDomain = domainOf(settings.fromAddress);
    if (fromDomain && FREE_MAIL.test(fromDomain))
        checks.push({
            id: 'from-domain',
            status: 'fail',
            message: `${fromDomain} is a personal mailbox provider: its DMARC refuses mail it didn’t send. Send from a domain you own.`
        });

    if (!unavailable && options.verifySmtp !== false) {
        try {
            const transporter = await createTransport();
            await transporter.verify();
            checks.push({
                id: 'smtp',
                status: 'ok',
                message: `${process.env.SMTP_HOST} answered and accepted the sign-in.`
            });
        } catch (err) {
            checks.push({
                id: 'smtp',
                status: 'fail',
                message: `${process.env.SMTP_HOST} did not take the connection: ${(err as Error).message}`
            });
        }
        if (smtpPort() !== 465 && smtpPort() !== 587)
            checks.push({
                id: 'smtp-port',
                status: 'warn',
                message: `Port ${smtpPort()}: mail services take 587 (STARTTLS) or 465 (TLS). Port 25 is often blocked.`
            });
    }

    if (fromDomain && !FREE_MAIL.test(fromDomain))
        checks.push(...(await checkDns(fromDomain, options)));

    // Links that go to another domain than the mail comes from look like phishing to filters.
    const base = fromDomain ? baseDomain(fromDomain) : '';
    for (const [id, url] of [
        ['links-studio', studioUrl()],
        ['links-api', apiUrl()]
    ] as const) {
        if (!url || !base) continue;
        const host = new URL(url).hostname;
        checks.push(
            baseDomain(host) === base
                ? { id, status: 'ok', message: `Links go to ${host}, on ${base} like the mail.` }
                : {
                      id,
                      status: 'warn',
                      message: `Links go to ${host}, but mail comes from ${fromDomain}: filters trust mail whose links match its domain.`
                  }
        );
    }
    if (!studioUrl())
        checks.push({
            id: 'links-studio',
            status: 'info',
            message: 'STUDIO_URL is not set: code emails go without their sign-in link.'
        });
    if (!apiUrl())
        checks.push({
            id: 'unsubscribe',
            status: 'info',
            message:
                'MOTEUR_API_URL is not set: review emails go without a one-click unsubscribe link.'
        });
    if (!settings.footer)
        checks.push({
            id: 'footer',
            status: 'info',
            message:
                'No footer: some laws (CASL in Canada, CAN-SPAM in the US) want the sender’s postal address on mail that isn’t a reply to a request.'
        });

    if (!options.to) return { checks };
    if (unavailable) return { checks };
    const dkim = dkimConfig();
    const email = renderEmail('test', {
        from: `${settings.fromName} <${settings.fromAddress}>`,
        server: `${process.env.SMTP_HOST}:${smtpPort()}`,
        at: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        ...(dkim && { signedBy: `${dkim.domainName} (selector ${dkim.keySelector})` })
    });
    try {
        const { messageId } = await deliver({
            to: [options.to],
            subject: email.subject,
            text: email.text,
            html: email.html,
            attachments: email.attachments,
            category: 'test'
        });
        checks.push({
            id: 'send',
            status: 'ok',
            message: `Sent to ${options.to} (${messageId}). Open its source to see SPF, DKIM and DMARC results.`
        });
        return { checks, sent: { to: options.to, messageId } };
    } catch (err) {
        checks.push({
            id: 'send',
            status: 'fail',
            message: `Not sent: ${(err as Error).message}`
        });
        return { checks };
    }
}
