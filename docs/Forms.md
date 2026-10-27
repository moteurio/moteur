# Forms and submissions

A form defines visitor input independently of the entry models it may populate. The engine validates and stores submissions, then runs configured actions such as creating a draft entry, sending email, or dispatching a webhook.

## Define a form

Use a member JWT to create a form with `POST /projects/:projectId/forms`:

```json
{
    "id": "contact",
    "label": "Contact",
    "status": "active",
    "honeypot": true,
    "fields": {
        "email": { "type": "core/email", "label": "Email", "options": { "required": true } },
        "message": {
            "type": "core/text",
            "label": "Message",
            "options": { "required": true, "multilingual": false }
        }
    },
    "successMessage": { "en": "Thank you for your message." }
}
```

Forms can be `active`, `inactive` or `archived`. Only active forms accept public submissions. Fields use the same schema system as other content. Authenticated form definitions can contain actions, notification recipients and anti-spam configuration; do not return those definitions directly to a public browser. Expose public form metadata through a collection that grants the form instead.

## In every language

A field's `label`, `description`, `help` and `placeholder`, and each choice's `label`, can be one text or one per language. So can `submitLabel` and `successMessage`. A choice keeps one `value` whatever the language, so answers stay comparable:

```json
"topic": {
    "type": "core/select",
    "label": { "en": "Topic", "fr": "Sujet" },
    "help": { "en": "Pick the closest", "fr": "Choisissez le plus proche" },
    "messages": { "choice": { "en": "Pick one of the topics", "fr": "Choisissez un des sujets" } },
    "options": {
        "required": true,
        "choices": [
            { "value": "sales", "label": { "en": "Sales", "fr": "Ventes" } },
            { "value": "help", "label": { "en": "Help", "fr": "Aide" } }
        ]
    }
}
```

`GET /projects/:projectId/collections/:collectionId/forms/:id?locale=fr` returns every text in that language, ready to render. `fr-CA` reads `fr`; a language nobody wrote falls back to the first one written. A field's `messages` holds your own words for each issue code, used before the engine's.

The public form also says what a site must show: `captcha` (its `provider` and `siteKey`, never the secret) and `timeTrap`.

## Submit from a site

The submission route is intentionally public and rate limited; it does not require a JWT or project API key. It accepts JSON or URL-encoded form data:

```http
POST /projects/my-project/forms/contact/submit
Content-Type: application/json

{
    "email": "visitor@example.com",
    "message": "Please contact me.",
    "_locale": "en",
    "_honeypot": ""
}
```

An accepted request returns `success`, `submissionId` and a localized message, with an optional configured `redirectUrl`. A successful receipt does not mean every action has completed: processing runs after storage and records individual `actionResults`. The plan's monthly submission limit applies.

From a site with `@moteurio/client`, `forms.submit()` answers what the visitor needs to see instead of throwing:

```ts
const moteur = createMoteurPublicClient({ baseURL, auth: { type: 'apiKey', apiKey, projectId } });
const token = await moteur.forms.token('contact'); // when the form is shown
const result = await moteur.forms.submit('contact', answers, { locale: 'fr', token, captcha });
if (result.ok) show(result.message);
else if (result.reason === 'answers') result.issues.forEach(i => mark(i.field, i.message));
else resetCaptcha(); // reason: 'captcha'
```

## People, not bots

Three checks, cheapest first. Spam gets the usual thank-you, so a bot learns nothing. It is kept with `status: "spam"` and a `metadata.spamReason`, runs no actions, sends no email, isn't counted against the plan, and is deleted 30 days after it arrived (or after someone marked it). Marking it "not spam" in the Inbox puts it back.

- **Honeypot** (`honeypot`, on by default): a hidden `_honeypot` field nobody sees. Filled in, it's spam (`honeypot`).
- **Time trap** (`timeTrap`): bots send in the instant they load a form. Ask `GET /projects/:projectId/forms/:formId/token` when the form is shown, and send the token back as `_token`. An answer sent sooner than `minSeconds` (default 3) after is spam (`too_fast`). Without a token the trap says nothing, unless `required` is set (`no_token`): only set it when every site that posts the form sends one. Tokens are signed with a key kept per project in `.moteur/secrets.json`, and last 24 hours. Each submission keeps `metadata.fillSeconds`.
- **Captcha** (`captcha`): Cloudflare Turnstile, hCaptcha or reCAPTCHA (v2, or v3 with `minScore`, default 0.5). The server asks the provider about the widget's answer (`cf-turnstile-response`, `h-captcha-response`, `g-recaptcha-response`, or `_captcha`), with the visitor's address. No answer, or one the provider refuses, gets a `400` with `code: "CAPTCHA_FAILED"`: nothing is stored, and the visitor answers it and sends again. A reCAPTCHA v3 score below `minScore` is spam (`captcha_score`). If the provider can't be reached within 5 seconds, the answer is kept and marked `metadata.captchaUnchecked`, so an outage doesn't lose leads. Answers are checked before the captcha, so a typo doesn't spend a captcha answer.

Set a captcha with its secret, which is written once and never kept in the form file (forms are in Git):

```json
"captcha": { "provider": "turnstile", "siteKey": "0x4AAA…", "secretKey": "0x4AAA…" }
```

The secret goes to `.moteur/secrets.json`, encrypted with `MOTEUR_ENCRYPTION_KEY`. Reading the form shows `secretSet: true` instead. Send `secretKey: ""` to remove it, or `captcha: null` to remove the captcha. A form saved with the older `recaptcha: { siteKey, secretKey }` setting is read as a reCAPTCHA captcha, and its secret moves out of the form file the next time it is saved.

## Where a letter came from

Each submission keeps the page it was sent from, where the visitor came from before, and the campaign in the page's `utm_*` parameters (`metadata.page`, `metadata.referrer`, `metadata.campaign`: source, medium, campaign, term and content). A site sends them as `_page` (`location.href`) and `_referrer` (`document.referrer`), as the Studio's snippet does. Without `_page`, the browser's Referer header is used, which a cross-site post usually cuts to the site's origin. Only http(s) addresses are kept, without their fragment or credentials. The Inbox shows them, and the CSV export adds `page`, `referrer` and `utm_*` columns when any letter has them. The export also prefixes an answer starting with `=`, `+`, `-` or `@` with a quote, so a spreadsheet never runs it as a formula.

## What the server checks

The browser's checks can be skipped, so the server checks every answer again against the form's fields before anything is stored:

- Only the form's fields are kept; other keys are dropped. Keys starting with `_` are instructions, never answers.
- Required fields must have an answer. An unticked `core/boolean` is a "no", so a required one must be ticked.
- `core/email`, `core/url` (http or https), `core/phone`, `core/date` (`YYYY-MM-DD`), `core/datetime` and `core/time` must look like one.
- `core/number` becomes a number and respects `min` and `max`. `core/boolean` takes `true`, `on`, `yes` or `1`, and their opposites.
- `core/select` and `core/multi-select` take only their `choices`; one answer unless the field allows several.
- Text is trimmed and respects `minLength` and `maxLength`; without them, it stops at 1,000 characters (10,000 for `core/textarea`). Objects and lists are refused where one answer is expected.

A form that declares no fields takes any answers, as text within those limits.

When answers don't fit, the reply is `422` with `code: "ANSWERS_INVALID"`, an `error` naming the fields for the visitor, and `issues: [{ field, code, message }]`. Labels and messages are in the visitor's `locale`: the field's own `messages` when it has them, else the engine's, in English or French. The codes are `required`, `invalid`, `too_long`, `too_short`, `too_small`, `too_large` and `choice`. Nothing is stored and nothing counts against the limit. A caught bot gets the usual thank-you instead, so it learns nothing.

## Actions and inbox

`createEntry` maps form fields into a model and creates a draft. `email` sends a configured message. `webhook` dispatches `form.submitted` to configured outbound webhook subscribers. Optional notifications can email recipients or confirm receipt to the submitter. Email delivery requires the host's mail configuration. See [Webhooks](Webhooks.md) for signing and delivery behavior.

Member-only inbox routes live under `/projects/:projectId/forms/:formId/submissions`, including listing, export, individual reads, status updates and deletion. Listing pages through an index (`user-data/forms/:formId/_index.json`) kept up to date on every save, so it opens only the page's submissions; the index is rebuilt from the files when it is missing or out of step. Public collection readers cannot read the inbox. See the host's OpenAPI document for filters and export parameters.

## What plugins add

A plugin can give forms four things. Each runs on the server, and none can stop a letter from being kept.

- **Actions** (`registerFormAction`). A form lists them like its own, with the plugin's `type` and this form's `config`: `{ "type": "sheets:append", "config": { "sheet": "Leads" } }`. The type is always `plugin:name`, so it never clashes with the engine's. The action says which settings it asks for, and can check them when the form is saved: a form that names an action no plugin on this server provides is refused. It runs after the engine's own actions, gets 15 seconds, and what it says (`detail`, or the error) is kept in the letter's `actionResults`. A failing action never stops the others. `GET /projects/:projectId/forms/actions` lists the actions this server's plugins add, for the Studio.
- **Field checks** (`registerFormField`). A field type a plugin registered (`geo/location`) gets the plugin's check for visitors' answers: it returns the value to keep, or an issue like the engine's own. Lists and objects are allowed when the check accepts them.
- **Spam checks** (`registerSubmissionScreen`). After the honeypot, the time trap and the captcha, on answers that already fit the form. The first that says spam wins: the letter is kept as spam with `spamReason: "screen"`, `screenedBy` and the check's `screenNote`. A check that fails or takes longer than 3 seconds is skipped.
- **Holds** (`registerSubmissionHold`). A hold can keep a letter's actions waiting, for a double opt-in for example. The letter is kept with status `held` and `heldBy`, and nothing runs (not even the team's notice) until the plugin calls `releaseSubmission` from `@moteurio/core/host.js`. A hold that fails or is slow lets the letter through.

Submission data lives under the project's gitignored `user-data/` store. Back it up separately from the content branch and define retention appropriate to the information your form collects. See [Operations](Operations.md) and [Git](Git.md).
