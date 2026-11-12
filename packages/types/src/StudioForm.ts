import type { Field } from './Field.js';

/**
 * How admin clients present a model's entries. This is presentation only: it does not change what
 * is stored, what the API returns, or who can edit. A model has at most one form. Without one,
 * the admin client builds a default layout from the model's fields.
 */
export interface ModelStudio {
    form?: StudioForm;
    /** How the model's entry list is presented. Without it, the admin client infers a layout from the model's fields. */
    list?: StudioList;
}

/** A way to display a model's entries: rows (`list`), a list beside a preview (`split`), image cards (`cards`) or a workflow board (`board`). */
export type StudioListView = 'list' | 'split' | 'cards' | 'board';
export const STUDIO_LIST_VIEWS: StudioListView[] = ['list', 'split', 'cards', 'board'];

/** Initial sort orders for a list: last edited, newest created, or by title. */
export type StudioListSort = 'edited' | 'created' | 'title';
export const STUDIO_LIST_SORTS: StudioListSort[] = ['edited', 'created', 'title'];

/** Field types a list can be grouped by (one value per entry), in addition to the special `$workflow` value. */
export const STUDIO_GROUP_TYPES = ['core/relation', 'core/select', 'core/status'];

/**
 * Presentation settings for a model's entry list. Every key is optional. Omitted settings are
 * inferred from the model's fields, and users can still change the view, sort and grouping.
 */
export interface StudioList {
    /** Views offered, in this order. The `cards` view needs a thumbnail; the `board` view needs the review workflow. */
    views?: StudioListView[];
    /** The view shown initially. Users can switch views, and admin clients can remember their choice. */
    defaultView?: StudioListView;
    /** ID of an image or asset field to use as the thumbnail, or false for no thumbnail. */
    thumbnail?: string | false;
    /** Fields shown under the title, joined with " · ". */
    subtitle?: string[];
    /** Fields shown as columns in the list view, in order. */
    columns?: string[];
    /** Fields offered as filters, in addition to the built-in filters for status, locales and editor. */
    filters?: string[];
    sort?: StudioListSort;
    /** Relation, select or status field to group rows by, or `$workflow` to group by workflow state. */
    groupBy?: string;
}

export interface StudioForm {
    sections: StudioFormSection[];
}

/**
 * How a form section is laid out.
 * - `canvas`: resembles the finished page (titles, introductions, images, body text).
 * - `card`: a card of facts with one label and value per line.
 * - `drawer`: collapsed by default; suited to slugs, SEO fields and other technical fields.
 * - `sheet`: labelled inputs in rows; suited to models that hold settings.
 */
export type StudioSectionKind = 'canvas' | 'card' | 'drawer' | 'sheet';

export interface StudioFormSection {
    id: string;
    kind: StudioSectionKind;
    /** `side` places the section in the column beside the main one. Ignored on narrow screens. */
    place?: 'main' | 'side';
    /** A string, or a map from locale code to string such as `{ "fr": "Dans le numéro", "en": "In print" }`. */
    label?: string | Record<string, string>;
    /** Fields shown one per line. */
    fields?: StudioFormItem[];
    /** Fields shown side by side, up to three per row. Use either `rows` or `fields`, not both. */
    rows?: StudioFormItem[][];
}

/** A field name, or a field together with how it is presented. */
export type StudioFormItem = string | StudioFormField;

export interface StudioFormField {
    field: string;
    /** Presentation style. It must be one that the field's type allows (see `STUDIO_PRESENTATIONS`). */
    as?: string;
    /** Help text shown with the field. It replaces the field's description. */
    help?: string | Record<string, string>;
    /** Shows the field only when other fields hold one of the listed values, for example `{ "kind": ["online"] }`. */
    when?: Record<string, unknown[]>;
}

/** The presentations each field type supports. `plain` (the type's default control) is always allowed. */
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
    'core/boolean': ['switch'],
    'core/list': ['table', 'cards', 'panel']
};

export const STUDIO_SECTION_KINDS: StudioSectionKind[] = ['canvas', 'card', 'drawer', 'sheet'];

export interface StudioFormProblem {
    path: string;
    message: string;
}

/** Returns the field name of a form item, whether it is a plain name or a field object. */
export const studioItemField = (item: StudioFormItem): string =>
    typeof item === 'string' ? item : item?.field;

/**
 * Validates a form against the model's fields. The returned problems are intended as warnings: a
 * form that names a deleted field still renders, and the editing UI reports the mistake to the
 * person arranging the form.
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

/**
 * Validates list settings against the model's fields. The returned problems are warnings: a list
 * that names a deleted field still displays, without that field.
 */
export function checkStudioList(list: unknown, fields: Record<string, Field>): StudioFormProblem[] {
    const problems: StudioFormProblem[] = [];
    const push = (path: string, message: string) => problems.push({ path, message });
    if (!list || typeof list !== 'object' || Array.isArray(list)) {
        push('list', 'List settings must be an object.');
        return problems;
    }
    const l = list as StudioList;
    const fieldList = (key: 'subtitle' | 'columns' | 'filters') => {
        const value = l[key];
        if (value === undefined) return;
        if (!Array.isArray(value))
            return push(`list.${key}`, `"${key}" must be a list of field names.`);
        value.forEach((name, i) => {
            if (typeof name !== 'string' || !fields[name])
                push(`list.${key}[${i}]`, `"${String(name)}" is not a field of this model.`);
        });
    };
    if (l.views !== undefined) {
        if (!Array.isArray(l.views) || l.views.length === 0)
            push('list.views', '"views" must list at least one view.');
        else
            l.views.forEach((v, i) => {
                if (!STUDIO_LIST_VIEWS.includes(v))
                    push(
                        `list.views[${i}]`,
                        `"${String(v)}" is not a view (${STUDIO_LIST_VIEWS.join(', ')}).`
                    );
            });
    }
    if (l.defaultView !== undefined) {
        if (!STUDIO_LIST_VIEWS.includes(l.defaultView))
            push('list.defaultView', `"${String(l.defaultView)}" is not a view.`);
        else if (Array.isArray(l.views) && !l.views.includes(l.defaultView))
            push('list.defaultView', `"${l.defaultView}" is not among the views offered.`);
    }
    if (l.thumbnail !== undefined && l.thumbnail !== false) {
        const f = typeof l.thumbnail === 'string' ? fields[l.thumbnail] : undefined;
        if (!f) push('list.thumbnail', `"${String(l.thumbnail)}" is not a field of this model.`);
        else if (f.type !== 'core/image' && f.type !== 'core/asset')
            push('list.thumbnail', `"${l.thumbnail}" is not an image field.`);
    }
    fieldList('subtitle');
    fieldList('columns');
    fieldList('filters');
    if (l.sort !== undefined && !STUDIO_LIST_SORTS.includes(l.sort))
        push('list.sort', `"sort" must be one of ${STUDIO_LIST_SORTS.join(', ')}.`);
    if (l.groupBy !== undefined && l.groupBy !== '$workflow') {
        const f = fields[l.groupBy];
        if (!f) push('list.groupBy', `"${String(l.groupBy)}" is not a field of this model.`);
        else if (!STUDIO_GROUP_TYPES.includes(f.type))
            push(
                'list.groupBy',
                `"${l.groupBy}" can't group rows: use a relation, select or status field.`
            );
    }
    return problems;
}
