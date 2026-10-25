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

An accepted request returns `success`, `submissionId` and a localized message, with an optional configured `redirectUrl`. A successful receipt does not mean every action has completed: processing runs after storage and records individual `actionResults`. Honeypot catches are treated as spam and skip actions. Additional reCAPTCHA and host quota rules can apply.

## Actions and inbox

`createEntry` maps form fields into a model and creates a draft. `email` sends a configured message. `webhook` dispatches `form.submitted` to configured outbound webhook subscribers. Optional notifications can email recipients or confirm receipt to the submitter. Email delivery requires the host's mail configuration. See [Webhooks](Webhooks.md) for signing and delivery behavior.

Member-only inbox routes live under `/projects/:projectId/forms/:formId/submissions`, including listing, export, individual reads, status updates and deletion. Public collection readers cannot read the inbox. See the host's OpenAPI document for filters and export parameters.

Submission data lives under the project's gitignored `user-data/` store. Back it up separately from the content branch and define retention appropriate to the information your form collects. See [Operations](Operations.md) and [Git](Git.md).
