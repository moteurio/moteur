import type { FormSchema } from '@moteurio/types/Form.js';
import { formCaptcha } from '@moteurio/core/formGuard.js';
import { formText, localizeFields } from '@moteurio/core/formText.js';
import { stripUiFromFieldOptions } from './stripUiFromFields.js';

/**
 * What a site needs to render and submit a form: no actions, recipients, secrets or Studio hints.
 * With a `locale`, every label, hint, choice and message is in that language.
 */
export function toPublicForm(form: FormSchema, locale?: string): Record<string, unknown> {
    const stripped = form.fields
        ? Object.fromEntries(
              Object.entries(form.fields).map(([k, f]) => [
                  k,
                  {
                      ...f,
                      options: stripUiFromFieldOptions((f.options ?? {}) as Record<string, unknown>)
                  }
              ])
          )
        : form.fields;
    const fields = stripped && locale ? localizeFields(stripped, locale) : stripped;
    const text = (t: unknown) => (locale ? formText(t, locale) : t);
    const out: Record<string, unknown> = {
        id: form.id,
        label: form.label,
        description: form.description,
        fields,
        submitLabel: text(form.submitLabel),
        successMessage: text(form.successMessage),
        honeypot: form.honeypot ?? true
    };
    if (locale) out.locale = locale;
    if (form.redirectUrl != null && form.redirectUrl !== '') out.redirectUrl = form.redirectUrl;
    // What the site shows: the provider and its site key, never the secret.
    const captcha = formCaptcha(form);
    if (captcha) out.captcha = { provider: captcha.provider, siteKey: captcha.siteKey };
    if (form.timeTrap) out.timeTrap = form.timeTrap;
    return out;
}
