/**
 * A project's shape in one answer: its languages, how content goes live, who you are in it, and
 * each model's fields in a line. For agents (and people) about to read or write content.
 */
import { rolesInProject } from '@moteurio/types';

type Field = {
    type: string;
    label?: unknown;
    description?: unknown;
    options?: Record<string, unknown>;
};
type Model = {
    id: string;
    label?: unknown;
    description?: unknown;
    modelType?: string;
    fields?: Record<string, Field>;
};
type Project = {
    id: string;
    label?: unknown;
    description?: unknown;
    defaultLocale?: string;
    supportedLocales?: string[];
    siteUrl?: string;
    workflow?: { enabled?: boolean; requireReview?: boolean };
    memberRoles?: Record<string, string[]> | null;
};

const text = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v || undefined;
    if (v && typeof v === 'object')
        return Object.values(v).find(x => typeof x === 'string' && x) as string | undefined;
    return undefined;
};

/** How values of a type are written, when it isn't obvious from the name. */
const VALUES: Record<string, string> = {
    'core/rich-text': 'rich text (DAST JSON)',
    'core/block-list': 'blocks: [{ type, data }]',
    'core/asset': 'asset: { assetId, alt? }',
    'core/asset-list': 'assets: [{ assetId, alt? }]',
    'core/date': 'date (YYYY-MM-DD)',
    'core/datetime': 'date and time (ISO 8601)',
    'core/relation': 'entry id',
    'core/relations': 'entry ids'
};

/** `text, per language, required, max 140` for one field. */
export function describeField(f: Field): string {
    const o = f.options ?? {};
    const parts = [VALUES[f.type] ?? f.type.replace(/^core\//, '')];
    if (o.model) parts[0] += ` → ${String(o.model)}`;
    if (o.structure) parts[0] += ` (${String(o.structure)})`;
    if (o.multilingual) parts.push('per language');
    if (o.required) parts.push('required');
    if (Array.isArray(o.choices)) {
        parts.push(
            `one of ${o.choices.map(c => (c && typeof c === 'object' ? (c as { value: unknown }).value : c)).join(', ')}`
        );
    }
    if (o.maxLength) parts.push(`max ${String(o.maxLength)} characters`);
    if (o.min !== undefined || o.max !== undefined) parts.push(`${o.min ?? ''}–${o.max ?? ''}`);
    const about = text(f.description);
    return about ? `${parts.join(', ')}: ${about}` : parts.join(', ');
}

export function describeProject(
    project: Project,
    models: Model[],
    me: { id: string; name?: string; roles?: string[] }
) {
    const languages = [project.defaultLocale, ...(project.supportedLocales ?? [])].filter(
        (l, i, all): l is string => !!l && all.indexOf(l) === i
    );
    const workflow = project.workflow;
    return {
        project: {
            id: project.id,
            name: text(project.label),
            about: text(project.description),
            site: project.siteUrl
        },
        languages: {
            all: languages,
            default: project.defaultLocale,
            note: 'Fields “per language” hold { "<lang>": value }. Set one language with title.en=…'
        },
        goingLive: !workflow?.enabled
            ? 'Entries are drafts until published (entries_publish).'
            : workflow.requireReview
              ? 'Entries go live after a reviewer approves them: ask with entries_review. Admins may publish directly.'
              : 'Entries are drafts until published; reviews are available (entries_review) but not required.',
        you: { name: me.name, roles: rolesInProject(me, project) },
        models: models.map(m => ({
            id: m.id,
            name: text(m.label),
            about: text(m.description),
            ...(m.modelType && m.modelType !== 'content' ? { kind: m.modelType } : {}),
            fields: Object.fromEntries(
                Object.entries(m.fields ?? {}).map(([k, f]) => [k, describeField(f)])
            )
        }))
    };
}
