import type { Field } from './Field.js';

/**
 * How the Studio presents a model's entries. Presentation only: it never changes what is
 * stored, what the API returns, or who may edit. A model has at most one form; without one,
 * the Studio composes a default from the fields.
 */
export interface ModelStudio {
    form?: StudioForm;
    /** How the model's entry list looks. Without it, the Studio infers one from the fields. */
    list?: StudioList;
}

/** A way to show a model's entries: rows, list beside a preview, picture cards, workflow board. */
export type StudioListView = 'list' | 'split' | 'cards' | 'board';
export const STUDIO_LIST_VIEWS: StudioListView[] = ['list', 'split', 'cards', 'board'];

/** Sorts a list can start from: last edited, newest, or by title. */
export type StudioListSort = 'edited' | 'created' | 'title';
export const STUDIO_LIST_SORTS: StudioListSort[] = ['edited', 'created', 'title'];

/** Field types a list can group by (one value per entry), besides `$workflow`. */
export const STUDIO_GROUP_TYPES = ['core/relation', 'core/select', 'core/status'];

/**
 * A model's entry list (Paperback › Lists › spec). Every key is optional: what's left out is
 * inferred from the fields, and each person can still change view, sort and grouping.
 */
export interface StudioList {
    /** Views offered, in this order. Cards need a thumbnail; board needs the review workflow. */
    views?: StudioListView[];
    /** The view people start in (they can switch; the Studio remembers their choice). */
    defaultView?: StudioListView;
    /** An image or asset field, or false for no picture. */
    thumbnail?: string | false;
    /** Fields shown under the title, joined by " · ". */
    subtitle?: string[];
    /** Fields shown as columns in the list view, in order. */
    columns?: string[];
    /** Fields offered as filters (besides status, languages and who edited). */
    filters?: string[];
    sort?: StudioListSort;
    /** A relation, select or status field, or `$workflow`, to group rows by. */
    groupBy?: string;
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

/**
 * Checks list settings against the model's fields. Problems are warnings: a list naming a
 * field that is gone still shows, without that field.
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
