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

An accepted request returns `success`, `submissionId` and a localized message, with an optional configured `redirectUrl`. A successful receipt does not mean every action has completed: processing runs after storage and records individual `actionResults`. Honeypot catches are treated as spam and skip actions. The plan's monthly submission limit applies. The form type has a `recaptcha` setting, but the engine doesn't check it yet.

## What the server checks

The browser's checks can be skipped, so the server checks every answer again against the form's fields before anything is stored:

- Only the form's fields are kept; other keys are dropped. Keys starting with `_` are instructions, never answers.
- Required fields must have an answer. An unticked `core/boolean` is a "no", so a required one must be ticked.
- `core/email`, `core/url` (http or https), `core/phone`, `core/date` (`YYYY-MM-DD`), `core/datetime` and `core/time` must look like one.
- `core/number` becomes a number and respects `min` and `max`. `core/boolean` takes `true`, `on`, `yes` or `1`, and their opposites.
- `core/select` and `core/multi-select` take only their `choices`; one answer unless the field allows several.
- Text is trimmed and respects `minLength` and `maxLength`; without them, it stops at 1,000 characters (10,000 for `core/textarea`). Objects and lists are refused where one answer is expected.

A form that declares no fields takes any answers, as text within those limits.

When answers don't fit, the reply is `422` with `code: "ANSWERS_INVALID"`, an `error` naming the fields for the visitor (in French when `locale` starts with `fr`, English otherwise), and `issues: [{ field, code, message }]` for a site that writes its own messages. The codes are `required`, `invalid`, `too_long`, `too_short`, `too_small`, `too_large` and `choice`. Nothing is stored and nothing counts against the limit. A caught bot gets the usual thank-you instead, so it learns nothing.

## Actions and inbox

`createEntry` maps form fields into a model and creates a draft. `email` sends a configured message. `webhook` dispatches `form.submitted` to configured outbound webhook subscribers. Optional notifications can email recipients or confirm receipt to the submitter. Email delivery requires the host's mail configuration. See [Webhooks](Webhooks.md) for signing and delivery behavior.

Member-only inbox routes live under `/projects/:projectId/forms/:formId/submissions`, including listing, export, individual reads, status updates and deletion. Public collection readers cannot read the inbox. See the host's OpenAPI document for filters and export parameters.

Submission data lives under the project's gitignored `user-data/` store. Back it up separately from the content branch and define retention appropriate to the information your form collects. See [Operations](Operations.md) and [Git](Git.md).
