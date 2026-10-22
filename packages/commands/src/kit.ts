/** Shapes many groups share: create/read/update/delete, and schema history. */
import {
    BODY_ARGS,
    id as idArg,
    project,
    type ArgSpec,
    type Column,
    type CommandSpec
} from './spec.js';
import { localized } from './format.js';

type Spec = Omit<CommandSpec, 'group'>;

/** `a layout`, `an entry`. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const a = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

export interface CrudOptions {
    /** Singular, for messages: `layout`. */
    noun: string;
    /** `/projects/{project}/layouts`. */
    base: string;
    /** The id's name in the path: `{id}`, `{layoutId}`. */
    idName?: string;
    table?: Column[];
    /** The list's property in the response (`layouts`), when it isn't a bare array. */
    pick?: string;
    /** Commands to leave out: `replace`, `create`… */
    skip?: ('list' | 'get' | 'create' | 'update' | 'replace' | 'delete')[];
    /** Extra arguments for list. */
    listArgs?: ArgSpec[];
    /** Offer PUT (replace) as well as PATCH (update). */
    replace?: boolean;
}

/** The usual five (or six) commands for a resource kept as JSON. */
export function crud(o: CrudOptions): Spec[] {
    const key = o.idName ?? 'id';
    const one = `${o.base}/{${key}}`;
    const idA: ArgSpec = { ...idArg(o.noun, key), aliases: key === 'id' ? [] : ['id'] };
    const skip = new Set(o.skip ?? []);
    const out: Spec[] = [];
    if (!skip.has('list'))
        out.push({
            name: 'list',
            summary: `List the ${o.noun}s`,
            args: [project, ...(o.listArgs ?? [])],
            http: `GET ${o.base}`,
            pick: o.pick,
            table: o.table ?? [
                { key: 'id', header: 'id' },
                { key: 'label', header: 'label', format: localized }
            ],
            readOnly: true
        });
    if (!skip.has('get'))
        out.push({
            name: 'get',
            summary: `Show one ${o.noun}`,
            args: [project, idA],
            http: `GET ${one}`,
            readOnly: true
        });
    if (!skip.has('create'))
        out.push({
            name: 'create',
            summary: `Create ${a(o.noun)} from its JSON`,
            args: [project],
            body: 'json',
            http: `POST ${o.base}`,
            examples: [`moteur ${o.noun}s create --file=${o.noun}.json`]
        });
    if (!skip.has('update'))
        out.push({
            name: 'update',
            summary: `Change part of ${a(o.noun)} (JSON with the fields to change)`,
            args: [project, idA],
            body: 'json',
            http: `PATCH ${one}`
        });
    if (o.replace && !skip.has('replace'))
        out.push({
            name: 'replace',
            summary: `Replace ${a(o.noun)} with the JSON given`,
            args: [project, idA],
            body: 'json',
            http: `PUT ${one}`,
            destructive: true
        });
    if (!skip.has('delete'))
        out.push({
            name: 'delete',
            summary: `Delete ${a(o.noun)}`,
            args: [project, idA],
            http: `DELETE ${one}`,
            destructive: true,
            done: (_r, a) => `Deleted ${a[key]}.`
        });
    return out;
}

const REVISION_TABLE: Column[] = [
    { key: 'number', header: '#' },
    { key: 'id', header: 'revision', format: v => String(v).slice(0, 10) },
    { key: 'savedAt', header: 'saved' },
    { key: 'savedBy', header: 'by' },
    { key: 'message', header: 'message' }
];

/** history / version / restore for anything git keeps revisions of. */
export function revisions(o: { noun: string; path: string; ids: ArgSpec[] }): Spec[] {
    const max: ArgSpec = {
        name: 'max',
        type: 'number',
        description: 'How many versions',
        in: 'query'
    };
    // After the ids: `moteur entries version <model> <id> <revision>`.
    const after = o.ids.filter(a => a.positional !== undefined).length;
    const revision: ArgSpec = {
        name: 'revision',
        description: 'Revision id (from history)',
        required: true,
        positional: after
    };
    return [
        {
            name: 'history',
            summary: `The saved versions of ${a(o.noun)}, newest first`,
            args: [project, ...o.ids, max],
            http: `GET ${o.path}/revisions`,
            table: REVISION_TABLE,
            readOnly: true
        },
        {
            name: 'version',
            summary: `${cap(a(o.noun))} as one saved version had it`,
            args: [project, ...o.ids, revision],
            http: `GET ${o.path}/revisions/{revision}`,
            readOnly: true
        },
        {
            name: 'restore',
            summary: `Bring a saved version of ${a(o.noun)} back`,
            args: [project, ...o.ids, revision],
            http: `POST ${o.path}/revisions/{revision}/restore`,
            destructive: true,
            done: (_r, a) => `Restored ${String(a.revision).slice(0, 10)}.`
        }
    ];
}

/** `--set title.en="Hello" --set readingTime=5` as an object (values read as JSON when they are). */
export function setPairs(pairs: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const pair of (pairs as string[] | undefined) ?? []) {
        const at = pair.indexOf('=');
        if (at < 1) throw new Error(`--set takes field=value, not "${pair}"`);
        const raw = pair.slice(at + 1);
        let value: unknown = raw;
        try {
            value = JSON.parse(raw);
        } catch {
            // Plain text.
        }
        const parts = pair.slice(0, at).split('.');
        let node = out;
        for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>;
        node[parts[parts.length - 1]] = value;
    }
    return out;
}

export const SET_ARG: ArgSpec = {
    name: 'set',
    type: 'list',
    whole: true,
    description: 'A field to set: field=value (title.en=Hello, readingTime=5); repeat for more',
    in: 'none'
};

export { BODY_ARGS };
