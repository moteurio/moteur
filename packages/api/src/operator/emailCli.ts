#!/usr/bin/env node
/**
 * The server's email, from the server itself.
 *
 *   moteur-email settings                    who mail comes from, how it looks, how it is sent
 *   moteur-email set <key> <value>           change a setting (see docs/Email.md)
 *   moteur-email unset <key>                 back to its default
 *   moteur-email check [--to you@example.com] [--selector s1]
 *                                            SMTP, SPF, DMARC, DKIM, MX, links; --to sends a test
 *   moteur-email preview <kind|all> [--locale fr] [--look folio] [--design id] [--text] [--out path]
 *
 * Reads the same settings as the API (DATA_ROOT, SMTP_*, MOTEUR_DKIM_*, STUDIO_URL). Run it
 * where the API's data is.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    readEmailSettings,
    resolveEmailSettings,
    saveEmailSettings,
    settingsFile,
    EMAIL_LOCALES,
    EMAIL_LOOKS,
    type EmailLook
} from '@moteurio/core/email/settings.js';
import { DESIGNS } from '@moteurio/core/email/layout.js';
import { renderEmail } from '@moteurio/core/email/render.js';
import { EMAIL_KINDS, samples, type EmailKind } from '@moteurio/core/email/templates.js';
import { dkimConfig, mailUnavailable, smtpPort } from '@moteurio/core/email/transport.js';
import { runEmailCheck } from '@moteurio/core/email/check.js';

try {
    process.loadEnvFile();
} catch {
    // No .env here: the environment has the settings.
}

const [command, ...args] = process.argv.slice(2);
/** `--name value` pairs, and the words that are not flags. `--text` takes no value. */
const named: [string, string][] = [];
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text') continue;
    if (args[i].startsWith('--')) named.push([args[i].slice(2), args[++i] ?? '']);
    else positional.push(args[i]);
}
const flags = (name: string) => named.filter(([k]) => k === name).map(([, v]) => v);
const flag = (name: string) => flags(name)[0];

const HELP = `moteur-email: the email this server sends.

  settings                         what is set, and what emails use
  set <key> <value>                change one: fromName, fromAddress, replyTo, productName,
                                   look (discotheque, folio, recipient), accent (#RRGGBB),
                                   logoUrl, logoFile, logoWidth, footer, supportUrl, locale (en, fr)
  unset <key>                      put one back to its default
  check [--to <email>] [--selector <s>]
                                   SMTP, SPF, DMARC, DKIM and MX; --to also sends a test email
  preview <kind|all> [--locale en|fr] [--look discotheque|folio] [--design <id>] [--text] [--out <path>]
                                   an email with sample data; all writes every one into --out

Kinds: ${EMAIL_KINDS.join(', ')}
Designs: ${DESIGNS.map(d => d.id).join(', ')}
Settings file: ${settingsFile()}`;

const MARK = { ok: 'ok  ', warn: 'warn', fail: 'FAIL', info: 'info' } as const;

function printSettings() {
    const stored = readEmailSettings();
    const effective = resolveEmailSettings(stored);
    const dkim = dkimConfig();
    console.log('Emails use:');
    for (const [k, v] of Object.entries(effective)) {
        if (v === undefined) continue;
        const own = k in stored ? '' : '  (default)';
        console.log(`  ${k.padEnd(12)} ${String(v).replace(/\n/g, ' / ')}${own}`);
    }
    console.log('\nSent through:');
    console.log(
        `  ${mailUnavailable() ?? `${process.env.SMTP_HOST}:${smtpPort()}${process.env.SMTP_USER ? ` as ${process.env.SMTP_USER}` : ''}`}`
    );
    console.log(
        `  DKIM: ${dkim ? `signed by the engine as ${dkim.domainName}, selector ${dkim.keySelector}` : 'not signed by the engine (the mail service may sign)'}`
    );
    if (process.env.SMTP_RETURN_PATH) console.log(`  Bounces to: ${process.env.SMTP_RETURN_PATH}`);
}

function preview(kind: EmailKind, look: EmailLook | undefined, locale: string | undefined) {
    const loc = locale === 'fr' ? 'fr' : locale ? 'en' : undefined;
    return renderEmail(kind, samples(loc ?? resolveEmailSettings().locale)[kind], {
        locale: loc,
        forceLook: look,
        design: flag('design'),
        images: 'data'
    });
}

async function main() {
    switch (command) {
        case 'settings':
            printSettings();
            break;
        case 'set':
        case 'unset': {
            const [key, ...rest] = positional;
            if (!key) throw new Error(`Which setting? moteur-email ${command} productName …`);
            const raw = rest.join(' ');
            const value =
                command === 'unset'
                    ? null
                    : key === 'logoWidth'
                      ? Number(raw)
                      : key === 'footer'
                        ? raw.replace(/\\n/g, '\n')
                        : raw;
            saveEmailSettings({ [key]: value }, 'server');
            console.log(command === 'unset' ? `${key} is back to its default.` : `${key} saved.`);
            break;
        }
        case 'check': {
            const to = flag('to');
            const { checks } = await runEmailCheck({ to, selectors: flags('selector') });
            for (const c of checks) {
                console.log(`${MARK[c.status]}  ${c.message}`);
                if (c.found) console.log(`      ${c.found}`);
            }
            const failed = checks.filter(c => c.status === 'fail').length;
            console.log(
                failed
                    ? `\n${failed} to fix.`
                    : '\nNothing to fix that the server can see. Send a test to mail-tester.com to see what a receiver thinks.'
            );
            if (failed) process.exitCode = 1;
            break;
        }
        case 'preview': {
            const [which] = positional;
            const look = flag('look') as EmailLook | undefined;
            if (look && !EMAIL_LOOKS.includes(look))
                throw new Error('--look is discotheque or folio');
            const out = flag('out');
            if (which === 'all') {
                if (!out) throw new Error('preview all needs --out <folder>');
                fs.mkdirSync(out, { recursive: true });
                let n = 0;
                for (const kind of EMAIL_KINDS)
                    for (const l of look ? [look] : EMAIL_LOOKS)
                        for (const loc of EMAIL_LOCALES) {
                            const email = preview(kind, l, loc);
                            const base = path.join(out, `${kind}.${email.design}.${loc}`);
                            fs.writeFileSync(`${base}.html`, email.html);
                            fs.writeFileSync(
                                `${base}.txt`,
                                `Subject: ${email.subject}\n\n${email.text}`
                            );
                            n++;
                        }
                console.log(`${n} emails written to ${out}`);
                break;
            }
            if (!EMAIL_KINDS.includes(which as EmailKind))
                throw new Error(`Which email? ${EMAIL_KINDS.join(', ')}, or all`);
            const email = preview(which as EmailKind, look, flag('locale'));
            const body = args.includes('--text')
                ? `Subject: ${email.subject}\n\n${email.text}`
                : email.html;
            if (out) {
                fs.writeFileSync(out, body);
                console.log(`Written to ${out}`);
            } else process.stdout.write(body);
            break;
        }
        default:
            console.log(HELP);
            process.exitCode = command && command !== 'help' && command !== '--help' ? 2 : 0;
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
