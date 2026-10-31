# Email

The engine sends a few emails of its own (sign-in codes, invitations, review notices) and the
ones a project's forms ask for. They are often the first thing a new person sees from a server, so
they are built to read well, in English and Canadian French, and to land in the inbox. This page
is for whoever runs the server: what goes out, how to set up sending, the settings, and what to do
in DNS so receivers trust the mail.

## What the engine sends

| Email                             | When                                                                          | To                      | Can be turned off                                           |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| Sign-in code                      | Someone asks for a code to sign in (`POST /auth/email/code`)                  | That address            | No (`MOTEUR_EMAIL_SIGNIN=off` turns email sign-in off)      |
| Sign-up code                      | The same, for an address with no account where sign-up is open, or invited    | That address            | No                                                          |
| Sign-in link only                 | Too many wrong codes today: codes are off, the link still works               | That address            | No                                                          |
| Address check                     | Someone signing in with a provider gives an address to confirm                | That address            | No                                                          |
| Welcome                           | A new account is made                                                         | The new person          | No                                                          |
| Invitation                        | A project admin invites someone (`POST /projects/:id/invites`), or resends it | The invited address     | No (an admin can copy the link instead)                     |
| Review asked, approved, sent back | An entry or page goes to review, or a reviewer decides                        | Reviewers, or who asked | Yes: per person, from the email's link or their preferences |
| Form notice                       | A form is filled in and the form notifies the team                            | The form's addresses    | By the form's settings                                      |
| Form confirmation (the project's) | A form confirms to whoever filled it in (`confirmationEmail`)                 | The address they gave   | By the form's settings                                      |
| Form email action (the project's) | A form's `email` action                                                       | The action's addresses  | By the form's settings                                      |
| Test                              | An operator runs the check with an address                                    | That address            | n/a                                                         |

A sign-in code or link that has been used, or has expired, is not resent on its own: the person
asks again and gets a new sign-in email. Sign-in emails go after the API has answered, so how
long the answer takes never tells whether an address has an account.

### First contact

Some emails are the first a person gets from the server, or from a project. They introduce
before they ask:

- **Invitation.** Who invited (their name and address, with their initials; never a picture),
  the project (its description and site address when it has them), the role and what it lets
  the person do, what the product is (`productTagline`), what happens on the link (they make an
  account with the invited address, or sign in if they have one), when the link stops working,
  and that nothing happens if they ignore it. The inviter can add a note (`note`, below).
- **Welcome.** What the product is, how to sign in next time and where help is (`supportUrl`).
  Someone who joined by invitation (with the invitation's link, or with a code while an
  invitation waits for their address) reads about the project they joined, who invited them and
  their role, with a link to the project. Someone who signed up alone reads what to do first.
- **Sign-up code.** The code, and a line on what the product is.
- **Form confirmation.** The project's own words first, then what the person sent (at most 6
  answers, each cut at 280 characters), the project's site, and why they got it. It is the
  project's mail, not the server's: see [A project's own mail](#a-projects-own-mail).

An invitation's note is a few words from the person inviting (`note` in
`POST /projects/:id/invites`): plain text, 500 characters at most, line breaks kept, shown as
written and sent again when the invitation is resent. The invitation's page reads it from
`GET /invites/:token`.

Every email has a plain-text part with the same words and every address written out, and an HTML
part.

`moteur-email preview all --out ./emails` writes every email, in both looks and both languages,
with sample data, to look at in a browser. `GET /operator/email/preview/:kind` does the same over
the API.

### Which look each email takes

The server's emails come in the two looks people choose between, Discothèque and Folio. With the
operator's `look` left at `recipient` (the default), each email follows its reader, when that
makes sense; an operator can set `look` to `discotheque` or `folio` to send every email in one.
Dark mode is the mail app's business: each look has a dark palette, so a person's lights on or
off is never sent.

| Email                                         | Look                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in code, sign-up code, sign-in link only | The look of the page that asked for it, when it says (`look` in `POST /auth/email/code`), so the email matches the page the person just left. Else the account's saved look. Else `defaultLook`. The page's look is used for that one email and never kept: anyone can ask for a code. |
| Address check                                 | The saved look of the account that has this address, if one does. Else `defaultLook`.                                                                                                                                                                                                  |
| Welcome, review emails                        | The person's saved look. A new account has none yet: its welcome takes the look of the page it was made on (`look` in `POST /auth/email/verify` or `POST /invites/:token/register`), for that email only. Else `defaultLook`.                                                          |
| Invitation                                    | The invited person hasn't chosen yet: the saved look of the account with that address, if there is one. Else `defaultLook`. Never the inviter's look.                                                                                                                                  |
| Form notice                                   | Each address in the look and language of its account, when it has one; else `defaultLook`. People sharing a look and language get one email together.                                                                                                                                  |
| Form confirmation, form email action          | Neither: they are the project's mail, in its own plain design (below).                                                                                                                                                                                                                 |
| Test                                          | `defaultLook`.                                                                                                                                                                                                                                                                         |

A person's saved look and language are the ones in their preferences
(`PATCH /auth/me/preferences`, `{ "look": "folio", "locale": "fr" }`).

## A project's own mail

A form's confirmation and its `email` action are not the server writing to its users: they are a
site writing to its visitors. So they go out as the project's, under its name, logo and colour,
with its address at the foot, and nothing of the product or the operator unless the operator
asks for one line (`projectCredit`, below). The form notice to the project's own people stays the
server's email, in each person's look.

A project's admins, builders, developers and content leads set this with
`PATCH /projects/:projectId/email`; any member reads it with
`GET /projects/:projectId/email`, and sees a form email with sample answers, as the settings (or
an unsaved draft of them, in `settings`) make it, with `POST /projects/:projectId/email/preview`.
The settings are kept with the project (`email` in its `project.json`). null or an empty string
clears one.

| Setting       | Default                 | Means                                                                                                                                                       |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `senderName`  | The project's name      | The name inboxes show, and the name at the top when there is no logo. 80 characters, without `< > " @`.                                                     |
| `replyTo`     | None                    | The project's contact address: replies to a confirmation reach the project, never the server. The email action replies to whoever filled in the form first. |
| `fromAddress` | The server's address    | An address on one of the operator's `sendingDomains` (below). Refused on any other domain.                                                                  |
| `logoAssetId` | None                    | An image from the project's media: PNG, JPEG or GIF, 100 KB at most. It goes inside each email, so it shows without loading anything.                       |
| `logoUrl`     | None                    | An `https` image, when the logo isn't in the media. Mail apps often hide remote images until the reader allows them. Setting one logo clears the other.     |
| `logoWidth`   | `120`                   | The logo's width in pixels, 24 to 300.                                                                                                                      |
| `accent`      | A neutral near-black    | `#RRGGBB` for the name, links and buttons. White text on it must read at 4.5:1, so a light colour is refused; in dark mode it is lightened to read.         |
| `footer`      | None                    | The business's postal address or legal line, at the foot (400 characters, line breaks kept). Canada's CASL asks for it on mail like this.                   |
| `siteUrl`     | The project's `siteUrl` | An `https` site linked at the foot.                                                                                                                         |

The design is plain on purpose: a white card on a light grey, the logo (or the name, in the
accent) centred above it, the system's own font, the address and site small at the foot. It has a
dark palette, uses tables and inline styles, and reads the same in every mail app, like the
server's own emails. The plain-text part carries the footer and the site too.

### Who it comes from

Mail always leaves through the server's SMTP account, and by default from the server's address
(`fromAddress`), with the project's name as the display name and its `replyTo`:

```
From: "Café Olimpico" <mail@moteur.example>
Reply-To: bonjour@olimpico.example
```

That keeps deliverability with whoever runs the server: SPF, DKIM and DMARC are set up for the
server's domain, and receivers trust it. A project can send from its own address only on a domain
the operator has added to `sendingDomains`. A domain is added only when its DNS passes the check
(`moteur-email check --domain olimpico.example`): an SPF record, a DMARC record, and a DKIM key
published there, with nothing failing. Before adding one, the domain's owner sets it up with the
server's mail service (the service gives the SPF include and the DKIM records to publish, and
signs as that domain). If the engine signs itself (`MOTEUR_DKIM_*`), it signs as its own domain
only: mail from a project's domain then passes DMARC only with the mail service's signature.

If the operator later removes a domain, the projects on it go back to the server's address
without anything breaking; the transport checks the list again before every email.

### The operator's line

On hosted plans an operator may want a small "Sent with Moteur" (« Envoyé avec Moteur ») at the
foot of projects' mail. `projectCredit: true` adds it, with the operator's `productName`. It is off
by default. A hosted service can turn it on for its whole deployment with the environment variable
`MOTEUR_EMAIL_PROJECT_CREDIT=1`; the operator's `projectCredit` setting, when set, wins over it.

## Setting up sending

Mail goes out over SMTP. Credentials stay in the environment; nothing secret is stored in the
settings file.

| Variable                                                                | Default | Purpose                                                                                                    |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`                                                             | Unset   | The mail server. Without it the engine sends nothing (and codes can't be emailed).                         |
| `SMTP_PORT`                                                             | `587`   | `587` upgrades to TLS (STARTTLS); `465` is TLS from the start.                                             |
| `SMTP_USER`, `SMTP_PASS`                                                | Unset   | The SMTP sign-in (often an API key).                                                                       |
| `SMTP_FROM`                                                             | Unset   | `Name <address>` or an address: the default From. The operator's `fromName` and `fromAddress` win over it. |
| `SMTP_RETURN_PATH`                                                      | Unset   | The envelope sender, where bounces go. Leave it to your mail service unless it tells you to set one.       |
| `MOTEUR_DKIM_DOMAIN`, `MOTEUR_DKIM_SELECTOR`, `MOTEUR_DKIM_PRIVATE_KEY` | Unset   | The engine signs every email with DKIM itself. The key is PEM; on one line, write its line breaks as `\n`. |
| `MOTEUR_DKIM_PRIVATE_KEY_FILE`                                          | Unset   | The same key, read from a file.                                                                            |
| `STUDIO_URL`                                                            | Unset   | Links in emails: the sign-in link in code emails, invitations, reviews, the welcome email.                 |
| `MOTEUR_API_URL`                                                        | Unset   | The API's public address, with `API_BASE_PATH`: the unsubscribe link in review emails.                     |

### A mail service, or your own server

Use a transactional mail service unless you already run mail well. They keep their sending
addresses' reputation clean, sign with DKIM, handle bounces and complaints, and show you what
happened to each message. Each gives SMTP settings to put in `SMTP_*`, and DNS records to publish.
Common ones, as of October 2026:

| Service    | `SMTP_HOST`                         | `SMTP_USER`                    |
| ---------- | ----------------------------------- | ------------------------------ |
| Postmark   | `smtp.postmarkapp.com`              | The server API token           |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | SMTP credentials from SES      |
| Resend     | `smtp.resend.com`                   | `resend` (the key as password) |
| Mailgun    | `smtp.mailgun.org`                  | The domain's SMTP login        |
| SendGrid   | `smtp.sendgrid.net`                 | `apikey`                       |
| Brevo      | `smtp-relay.brevo.com`              | The account's SMTP login       |

Keep sign-in and other transactional mail on its own service, or its own stream, apart from any
newsletters: a marketing campaign's complaints should never slow down someone's sign-in code.

Your own server (Postfix and the like) needs a fixed IP address with reverse DNS (PTR) naming the
server, a clean history for that address, TLS, and DKIM. If it doesn't sign, give the engine the
key (`MOTEUR_DKIM_*`) and it signs before sending.

## Who it comes from, and how it looks

The operator sets these with `moteur-email set <key> <value>` on the server, or
`PATCH /operator/email` with an operator token. They are kept in `data/operator/email.json` under
`DATA_ROOT`. `moteur-email settings` (or `GET /operator/email`) shows what is set and what the
emails use. `moteur-email unset <key>`, or `null` over the API, puts a setting back to its default.

| Setting          | Default                                     | Means                                                                                                                                                                                |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fromName`       | The name in `SMTP_FROM`, else productName   | The name inboxes show. Keep it the same over time.                                                                                                                                   |
| `fromAddress`    | The address in `SMTP_FROM`                  | The From address, on a domain you own and have set up (below).                                                                                                                       |
| `replyTo`        | None                                        | Where replies go. Invitations reply to the person who invited; form notices to the person who wrote.                                                                                 |
| `productName`    | `Moteur`                                    | The name the emails say: "482913 is your Moteur code".                                                                                                                               |
| `productTagline` | A line about the product, with its name     | What the product is, in a sentence or two (300 characters at most), in the first-contact emails. One text, or `{ "en": "…", "fr": "…" }`; a language left out uses the default line. |
| `look`           | `recipient`                                 | `recipient`: each email in its reader's look (see [Which look each email takes](#which-look-each-email-takes)). `discotheque` or `folio`: every email in that look.                  |
| `defaultLook`    | `discotheque`                               | The look when the reader's isn't known, with `look` at `recipient`: an invitation to a new address, a code asked for without a look.                                                 |
| `accent`         | The look's                                  | `#RRGGBB` for buttons and links. White text on it must read at 4.5:1, so a light colour is refused; in dark mode it is lightened to read.                                            |
| `logoUrl`        | None                                        | An `https` image shown in place of the product's name. Mail apps often hide remote images until the reader allows them: keep it optional.                                            |
| `logoFile`       | None                                        | A PNG, JPEG or GIF on the server (100 KB at most, relative to `DATA_ROOT`), sent inside each email: it shows without loading anything.                                               |
| `logoWidth`      | `120`                                       | The logo's width in pixels, 24 to 300.                                                                                                                                               |
| `footer`         | None                                        | A line at the foot of every email: your postal address or legal line. `\n` starts a new line.                                                                                        |
| `supportUrl`     | None                                        | An `https` page where people get help, linked at the foot.                                                                                                                           |
| `locale`         | `en`                                        | `en` or `fr`: the language when the reader's isn't known.                                                                                                                            |
| `sendingDomains` | None                                        | Domains projects may send their own mail from (`["olimpico.example"]`, or `a.example,b.example` on the command line). Each is added only when its DNS passes the check.              |
| `projectCredit`  | `MOTEUR_EMAIL_PROJECT_CREDIT`, else `false` | `true` adds "Sent with {productName}" at the foot of projects' own mail.                                                                                                             |

Each email's language is the reader's: the language the page asking for a code was in, then the
one in their preferences, then the one their account was made in, then `locale`. A person sets
their look, language and notification emails with `PATCH /auth/me/preferences`
(`{ "look": "folio", "locale": "fr", "emails": { "reviews": false } }`).

Some laws ask for the sender's postal address on mail that isn't a reply to the reader's own
request (CASL in Canada, CAN-SPAM in the United States). Sign-in codes answer a request; review
notices may not. A `footer` with your address covers both. A project's own mail carries the
project's `footer` instead, never the operator's.

## Being trusted by receivers

Gmail, Yahoo and Microsoft (Outlook.com) check that mail really comes from the domain in its From.
As of October 2026 they ask every sender for SPF or DKIM, a sending server with valid reverse DNS
(PTR), TLS, and a spam complaint rate under 0.3%; anyone sending more than about 5,000 messages a
day to them also needs SPF, DKIM and DMARC, with the From domain aligned with SPF or DKIM. Set all three up from the
start, whatever your volume. `moteur-email check` tells you what it finds.

**SPF** says which servers may send for a domain. One TXT record on the domain of the envelope
sender (your mail service's bounce domain, or your From domain):

```
example.com.  TXT  "v=spf1 include:<your service's SPF domain> ~all"
```

Only one SPF record per name: two count as none. Merge `include:`s into one record. Keep it under
10 DNS lookups.

**DKIM** signs each message, so a receiver knows it wasn't changed and which domain stands behind
it. Your mail service gives one or more records to publish (`<selector>._domainkey.example.com`);
with `MOTEUR_DKIM_*`, the engine signs and `moteur-email check` prints the record to publish. Sign
as your From domain, not the service's, so DMARC aligns.

**DMARC** tells receivers what to do when SPF and DKIM don't match the From domain, and where to
send reports:

```
_dmarc.example.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

Start with `p=none` and read the reports for a few weeks. Once your mail passes, move to
`p=quarantine`, then `p=reject`.

**Return path and bounces.** Most services send with their own envelope sender; point a
subdomain at them (`bounces.example.com`, as they say) so SPF aligns with your domain too. Set
`SMTP_RETURN_PATH` only if your service asks for it.

**The From address.** Use a domain you own, never a Gmail, Outlook or Yahoo address: their
DMARC refuses mail they didn't send. A subdomain for transactional mail (`mail.example.com`) keeps
its reputation apart from your people's own mail. Use the same domain for links: the engine's
links go to `STUDIO_URL` and `MOTEUR_API_URL`, and filters trust mail whose links match its
domain. Make the From address one that can receive mail (an MX record), even if replies go
elsewhere.

**Warming up.** A new domain or IP address has no reputation. Start with the mail people expect
(sign-in codes, invitations) and grow over a few weeks. Avoid sending a large batch on the first
day.

## What the engine does for deliverability

- A real plain-text part next to the HTML (`multipart/alternative`), with the same words.
- Small, table-based HTML with inline styles (under 24 KB; Gmail clips at 102 KB) that holds up in
  Gmail, Outlook (its Word engine too), Apple Mail and phones. No web fonts: system font stacks.
  No scripts, no remote images unless you set `logoUrl`, no tracking pixels, no rewritten links,
  no link shorteners.
- Dark mode: `color-scheme` set, and a dark palette for mail apps that follow it; colours chosen to
  stay readable where an app inverts them itself.
- The code first in the subject ("482913 is your Moteur code"), so it reads in the notification
  without opening the email; a short preheader; the code spaced to read and copied without the
  space.
- One From name and address, `Reply-To` when asked, a `Message-ID` on the From domain, a `Date`.
- `Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress` on every email, so
  out-of-office replies don't answer it.
- `List-Unsubscribe` with one-click (`List-Unsubscribe-Post`, RFC 8058) on review notices only,
  never on sign-in mail. The link opens a page with a button; visiting it changes nothing, so link
  scanners can't unsubscribe anyone.
- DKIM signing by the engine when you give it a key.
- Sign-in mail capped per address and for the whole server (`MOTEUR_EMAIL_CODES_PER_HOUR`).

## What the engine can't do for you

- Publish your DNS records, or fix a domain's or IP address's poor reputation.
- Set reverse DNS (PTR) or TLS on a mail server: that is the server's or the service's.
- Handle bounces and complaints: your mail service does. Remove addresses that bounce for good.
- Know whether a message reached the inbox. The check and the test email show what the server
  sees; receivers decide.

## Checking

```
moteur-email check                          # SMTP, SPF, DMARC, DKIM, MX, links
moteur-email check --to you@example.com     # and send a test email
moteur-email check --selector s1            # look for your service's DKIM selector too
moteur-email check --domain olimpico.example  # can projects send from this domain?
moteur-email check --project olimpico         # the domain of a project's From address
```

`POST /operator/email/check` does the same over the API (`{ "to", "selectors" }`, or
`{ "domain" }` or `{ "project" }`). It reports
each item as `ok`, `warn`, `fail` or `info`, and exits with 1 when something fails. It connects to
the SMTP server and signs in, reads the From domain's SPF, DMARC, DKIM (at your selector and the
usual ones) and MX records, compares the engine's DKIM key with the published one, and checks that
links go to the From domain.

Then send a test to [mail-tester.com](https://www.mail-tester.com) for a receiver's view, and open
the test email in Gmail with **Show original**: SPF, DKIM and DMARC should each say PASS. Once you
send in volume, [Google Postmaster Tools](https://postmaster.google.com) and Microsoft's SNDS show
your domain's reputation and spam rate.
