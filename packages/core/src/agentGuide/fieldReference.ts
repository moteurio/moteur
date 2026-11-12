/**
 * The skill's field reference (skills/moteur/references/fields.md), written from the field
 * registry (each type's description and options) and FIELD_EXAMPLES. tests/agentGuide.test.ts
 * fails when the file is out of date; `UPDATE_SKILL=1 pnpm --filter @moteurio/core test
 * agentGuide` writes it again.
 */
import '../fields/index.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import { FIELD_EXAMPLES } from './fieldExamples.js';

/** The types by what they hold, in the order a reader looks for them. */
export const FIELD_GROUPS: [string, string[]][] = [
    ['Text', ['core/text', 'core/textarea', 'core/markdown', 'core/rich-text', 'core/html']],
    [
        'Numbers and choices',
        [
            'core/number',
            'core/boolean',
            'core/select',
            'core/multi-select',
            'core/color',
            'core/icon'
        ]
    ],
    ['Dates and times', ['core/date', 'core/datetime', 'core/time']],
    ['Links and contact', ['core/link', 'core/url', 'core/email', 'core/phone', 'core/address']],
    [
        'Media',
        [
            'core/asset',
            'core/asset-list',
            'core/image',
            'core/media-image',
            'core/audio',
            'core/video',
            'core/model-3d'
        ]
    ],
    [
        'Structured data',
        [
            'core/object',
            'core/list',
            'core/map',
            'core/structure',
            'core/variant',
            'core/table',
            'core/json'
        ]
    ],
    ['Relations', ['core/relation', 'core/relations', 'core/categories', 'core/tags']],
    ['Blocks', ['core/block-list', 'core/layout']],
    ['System', ['core/slug', 'core/id', 'core/order', 'core/status']]
];

type OptionSpec = { type?: string; default?: unknown; description?: string };

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const shortType = (t?: string) => (t ?? '').replace(/^core\//, '') || '—';
const json = (v: unknown) => JSON.stringify(v, null, 4);

function section(type: string): string {
    const schema = fieldRegistry.get(type);
    const example = FIELD_EXAMPLES[type]!;
    const out = [`### ${type}`, '', schema.description ?? '', ''];
    out.push('```json', json(example.field), '```', '');
    out.push('Value:', '', '```json', json(example.value), '```', '');
    if (example.note) out.push(example.note, '');
    const options = Object.entries(
        (schema.optionsSchema ?? {}) as Record<string, OptionSpec>
    ).filter(([name]) => name !== 'ui');
    if (options.length) {
        out.push('| Option | Type | Default | What it does |', '| --- | --- | --- | --- |');
        for (const [name, o] of options) {
            // Describe `allowEmpty` here because the registry description does not cover how it works with `required`.
            const what =
                name === 'allowEmpty'
                    ? "With `required`: whether an empty value is accepted all the same. A field that isn't required may always be empty."
                    : (o.description ?? '');
            out.push(
                `| \`${name}\` | ${shortType(o.type)} | ${o.default === undefined ? '' : `\`${cell(JSON.stringify(o.default))}\``} | ${cell(what)} |`
            );
        }
        out.push('');
    }
    return out.join('\n');
}

export function fieldReference(): string {
    const head = `<!-- Written from the field registry and packages/core/src/agentGuide/fieldExamples.ts: don't edit by hand. -->

# Field types

Every field a model, template, block or structure has, as its \`fields\` hold it:

\`\`\`json
"fields": {
    "title": { "type": "core/text", "label": "Title", "options": { "required": true, "multilingual": true } }
}
\`\`\`

- \`type\` and \`label\` (one name, or one per language: \`{ "en": "Title", "fr": "Titre" }\`) on every field. \`description\` is shown as help in the Studio.
- Options go in \`options\`. Every field may have \`required\`, \`multilingual\` and \`ui\`. The rest are its type's, listed below. An option the type doesn't have is refused when the schema is saved.
- Two things go beside \`type\`, not in \`options\`: a list's item field (\`items\`) and an object's fields (\`fields\`).
- A field that isn't required may be left out or empty (\`""\`, \`[]\`, \`{}\`). \`allowEmpty\` only matters for a required field.
- \`multilingual: true\`: the value is one per language, \`{ "en": "…", "fr": "…" }\` (rich text: \`{ "dast": { "en": doc } }\`).
- A value for a field the schema doesn't have is a warning when saved, and refused by an import.

Each type below: its definition and a value it accepts (both checked against Moteur by a test), then its options.
`;
    const body = FIELD_GROUPS.map(
        ([group, types]) => `## ${group}\n\n${types.map(section).join('\n')}`
    ).join('\n');
    return `${head}\n${body}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
