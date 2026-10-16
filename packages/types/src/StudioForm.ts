import type { Field } from './Field.js';

/**
 * How the Studio presents a model's entries. Presentation only: it never changes what is
 * stored, what the API returns, or who may edit. A model has at most one form; without one,
 * the Studio composes a default from the fields.
 */
export interface ModelStudio {
    form?: StudioForm;
}

export interface StudioForm {
    sections: StudioFormSection[];
}

/**
 * - `canvas`: reads like the finished page (titles, ledes, images, bodies).
 * - `card`: a raised card of facts, label and value per line.
 * - `drawer`: closed by default; for slugs, SEO and other plumbing.
 * - `sheet`: labelled inputs in rows; for settings-like models.
 */
export type StudioSectionKind = 'canvas' | 'card' | 'drawer' | 'sheet';

export interface StudioFormSection {
    id: string;
    kind: StudioSectionKind;
    /** `side` puts the section in the column beside the main one (ignored on phones). */
    place?: 'main' | 'side';
    /** A string, or one label per language: `{ "fr": "Dans le numéro", "en": "In print" }`. */
    label?: string | Record<string, string>;
    /** One field per line. */
    fields?: StudioFormItem[];
    /** Fields side by side, up to three per row. Used instead of `fields`. */
    rows?: StudioFormItem[][];
}

/** A field name, or a field with how it shows. */
export type StudioFormItem = string | StudioFormField;

export interface StudioFormField {
    field: string;
    /** Presentation, from those the field's type allows (see STUDIO_PRESENTATIONS). */
    as?: string;
    /** A sentence shown with the field, replacing its description. */
    help?: string | Record<string, string>;
    /** Show the field only when other fields have one of these values: `{ "kind": ["online"] }`. */
    when?: Record<string, unknown[]>;
}

/** Presentations each field type can take. `plain` (the type's usual control) is always allowed. */
export const STUDIO_PRESENTATIONS: Record<string, string[]> = {
    'core/text': ['headline', 'kicker', 'line'],
    'core/textarea': ['lede', 'note'],
    'core/markdown': ['lede', 'note'],
    'core/rich-text': ['document'],
    'core/html': ['document'],
    'core/block-list': ['document'],
    'core/image': ['hero', 'thumb'],
    'core/asset': ['hero', 'thumb'],
    'core/relation': ['chip', 'person'],
    'core/relations': ['chip', 'person'],
    'core/select': ['segments', 'menu'],
    'core/status': ['segments', 'menu'],
    'core/number': ['big'],
    'core/order': ['big'],
    'core/date': ['ticket'],
    'core/datetime': ['ticket'],
    'core/boolean': ['switch']
};

export const STUDIO_SECTION_KINDS: StudioSectionKind[] = ['canvas', 'card', 'drawer', 'sheet'];

export interface StudioFormProblem {
    path: string;
    message: string;
}

/** The field name of an item, whatever its shape. */
export const studioItemField = (item: StudioFormItem): string =>
    typeof item === 'string' ? item : item?.field;

/**
 * Checks a form against the model's fields. Problems are meant as warnings: a form naming a
 * field that is gone still renders, and the editor shows the mistake to whoever arranges it.
 */
export function checkStudioForm(form: unknown, fields: Record<string, Field>): StudioFormProblem[] {
    const problems: StudioFormProblem[] = [];
    const push = (path: string, message: string) => problems.push({ path, message });
    if (!form || typeof form !== 'object' || Array.isArray(form)) {
        push('form', 'The form must be an object with "sections".');
        return problems;
    }
    const sections = (form as { sections?: unknown }).sections;
    if (!Array.isArray(sections)) {
        push('form.sections', '"sections" must be a list.');
        return problems;
    }
    const ids = new Set<string>();
    const placed = new Map<string, string>();
    sections.forEach((raw, i) => {
        const at = `form.sections[${i}]`;
        if (!raw || typeof raw !== 'object') return push(at, 'Each section must be an object.');
        const s = raw as StudioFormSection;
        if (!s.id || typeof s.id !== 'string') push(`${at}.id`, 'Each section needs an "id".');
        else if (ids.has(s.id)) push(`${at}.id`, `Two sections are called "${s.id}".`);
        else ids.add(s.id);
        if (!STUDIO_SECTION_KINDS.includes(s.kind))
            push(`${at}.kind`, `"kind" must be one of ${STUDIO_SECTION_KINDS.join(', ')}.`);
        if (s.place !== undefined && s.place !== 'main' && s.place !== 'side')
            push(`${at}.place`, '"place" must be "main" or "side".');
        if (s.fields !== undefined && s.rows !== undefined)
            push(at, 'Use "fields" or "rows", not both.');
        const items: [StudioFormItem, string][] = [];
        if (Array.isArray(s.fields))
            s.fields.forEach((it, j) => items.push([it, `${at}.fields[${j}]`]));
        else if (s.fields !== undefined) push(`${at}.fields`, '"fields" must be a list.');
        if (Array.isArray(s.rows))
            s.rows.forEach((row, r) => {
                if (!Array.isArray(row))
                    return push(`${at}.rows[${r}]`, 'Each row must be a list.');
                if (row.length > 3) push(`${at}.rows[${r}]`, 'A row holds at most three fields.');
                row.forEach((it, j) => items.push([it, `${at}.rows[${r}][${j}]`]));
            });
        else if (s.rows !== undefined) push(`${at}.rows`, '"rows" must be a list of lists.');
        for (const [item, path] of items) {
            const name = studioItemField(item);
            if (!name || typeof name !== 'string') {
                push(path, 'Each item is a field name or { "field": … }.');
                continue;
            }
            const field = fields[name];
            if (!field) {
                push(path, `The model has no field "${name}".`);
                continue;
            }
            if (placed.has(name)) push(path, `"${name}" is already placed at ${placed.get(name)}.`);
            else placed.set(name, path);
            if (typeof item === 'object' && item.as !== undefined && item.as !== 'plain') {
                const allowed = STUDIO_PRESENTATIONS[field.type] ?? [];
                if (!allowed.includes(item.as))
                    push(
                        `${path}.as`,
                        `"${name}" (${field.type}) can show as ${['plain', ...allowed].join(', ')}, not "${item.as}".`
                    );
            }
            if (typeof item === 'object' && item.when !== undefined) {
                if (!item.when || typeof item.when !== 'object' || Array.isArray(item.when))
                    push(`${path}.when`, '"when" maps field names to lists of values.');
                else
                    for (const [other, values] of Object.entries(item.when)) {
                        if (!fields[other])
                            push(`${path}.when`, `"when" names a missing field "${other}".`);
                        if (!Array.isArray(values))
                            push(`${path}.when.${other}`, 'Values must be a list.');
                    }
            }
        }
    });
    return problems;
}
