import type { FormSchema } from '@moteurio/types/Form.js';
import { stripUiFromFieldOptions } from './stripUiFromFields.js';

/** What a site needs to render and submit a form: no actions, recipients or Studio hints. */
export function toPublicForm(form: FormSchema): Record<string, unknown> {
    const fields = form.fields
        ? Object.fromEntries(
              Object.entries(form.fields).map(([k, f]: [string, any]) => [
                  k,
                  {
                      ...f,
                      options: stripUiFromFieldOptions((f.options ?? {}) as Record<string, unknown>)
                  }
              ])
          )
        : form.fields;
    const out: Record<string, unknown> = {
        id: form.id,
        label: form.label,
        description: form.description,
        fields,
        submitLabel: form.submitLabel,
        successMessage: form.successMessage,
        honeypot: form.honeypot ?? true
    };
    if (form.redirectUrl != null && form.redirectUrl !== '') out.redirectUrl = form.redirectUrl;
    return out;
}
