import type { Field } from '@moteurio/types/Field.js';

/**
 * Field definition helpers, so schemas read as a list of fields instead of nested JSON.
 * Common flags go in `options`, like the Studio writes them.
 */
type Common = {
    required?: boolean;
    multilingual?: boolean;
    description?: string;
    [option: string]: unknown;
};

function field(type: string, label: string, opts: Common = {}): Field {
    const { description, ...options } = opts;
    return {
        type,
        label,
        ...(description && { description }),
        ...(Object.keys(options).length > 0 && { options })
    } as Field;
}

type Choice = string | { value: string; label: string };

export const f = {
    text: (label: string, o?: Common) => field('core/text', label, o),
    textarea: (label: string, o?: Common) => field('core/textarea', label, o),
    richText: (label: string, o?: Common) => field('core/rich-text', label, o),
    markdown: (label: string, o?: Common) => field('core/markdown', label, o),
    html: (label: string, o?: Common) => field('core/html', label, o),
    slug: (label: string, source: string, o?: Common) =>
        field('core/slug', label, { sourceField: source, ...o }),
    number: (label: string, o?: Common) => field('core/number', label, o),
    boolean: (label: string, o?: Common) => field('core/boolean', label, o),
    date: (label: string, o?: Common) => field('core/date', label, o),
    datetime: (label: string, o?: Common) => field('core/datetime', label, o),
    time: (label: string, o?: Common) => field('core/time', label, o),
    color: (label: string, o?: Common) => field('core/color', label, o),
    email: (label: string, o?: Common) => field('core/email', label, o),
    phone: (label: string, o?: Common) => field('core/phone', label, o),
    url: (label: string, o?: Common) => field('core/url', label, o),
    link: (label: string, o?: Common) => field('core/link', label, o),
    icon: (label: string, o?: Common) => field('core/icon', label, o),
    id: (label: string, o?: Common) => field('core/id', label, o),
    json: (label: string, o?: Common) => field('core/json', label, o),
    // core/tags requires a "source"; free-form tags have none, so name it.
    tags: (label: string, o?: Common) => field('core/tags', label, { source: 'free', ...o }),
    order: (label = 'Order', o?: Common) => field('core/order', label, o),
    status: (label: string, o?: Common) => field('core/status', label, o),
    address: (label: string, o?: Common) => field('core/address', label, o),
    image: (label: string, o?: Common) => field('core/image', label, o),
    asset: (label: string, o?: Common) => field('core/asset', label, o),
    assetList: (label: string, o?: Common) => field('core/asset-list', label, o),
    video: (label: string, o?: Common) => field('core/video', label, o),
    model3d: (label: string, o?: Common) => field('core/model-3d', label, o),
    table: (label: string, o?: Common) => field('core/table', label, o),
    layout: (label: string, o?: Common) => field('core/layout', label, o),
    categories: (label: string, source: string, o?: Common) =>
        field('core/categories', label, { source, ...o }),
    structure: (label: string, structure: string, o?: Common) =>
        field('core/structure', label, { structure, ...o }),
    blocks: (label: string, o?: Common) => field('core/block-list', label, o),
    select: (label: string, choices: Choice[], o?: Common) =>
        field('core/select', label, { choices, ...o }),
    multiSelect: (label: string, choices: Choice[], o?: Common) =>
        field('core/multi-select', label, { choices, ...o }),
    relation: (label: string, model: string, o?: Common) =>
        field('core/relation', label, { model, ...o }),
    relations: (label: string, model: string, o?: Common) =>
        field('core/relations', label, { model, ...o }),
    object: (label: string, fields: Record<string, Field>, o?: Common) =>
        ({ ...field('core/object', label, o), fields }) as Field,
    list: (label: string, item: Field, o?: Common) =>
        ({ ...field('core/list', label, o), items: item }) as Field,
    geoLocation: (label: string, o?: Common) => field('geo/location', label, o),
    geoPolyline: (label: string, o?: Common) => field('geo/polyline', label, o),
    geoArea: (label: string, o?: Common) => field('geo/area', label, o)
};

/** `{ fr, en }` shorthand for multilingual values in the sources. */
export const t = (fr: string, en?: string): Record<string, string> =>
    en === undefined ? { fr } : { fr, en };
