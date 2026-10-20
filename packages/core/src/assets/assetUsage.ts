import type { User } from '@moteurio/types/User.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import { listModelSchemas } from '../models.js';
import { listEntries } from '../entries.js';
import { listPages } from '../pages.js';
import { listAssets } from './assetService.js';

/** Where an asset is used: a field (or a block inside one) of an entry or a page. */
export type AssetUsage =
    | {
          kind: 'entry';
          modelId: string;
          entryId: string;
          status?: string;
          /** The entry's title as stored: a string or one per language. */
          title?: unknown;
          /** Top-level field holding the asset. */
          field: string;
          /** Full path to the reference, e.g. `body.blocks[2].image.src`. */
          path: string;
      }
    | {
          kind: 'page';
          pageId: string;
          status?: string;
          title?: unknown;
          field: string;
          path: string;
      };

const ID_TOKEN = /[A-Za-z0-9]+-[A-Za-z0-9]+/g;
const TITLE_KEYS = ['title', 'name', 'label', 'headline'];

/**
 * Calls `found` for every asset reference in a stored value: an object with an `assetId`, or a
 * string pointing at an asset file (images inserted into rich text keep only their URL).
 */
export function findAssetRefs(
    value: unknown,
    known: Set<string>,
    found: (assetId: string, path: string) => void,
    path = ''
): void {
    if (typeof value === 'string') {
        if (!value.includes('assets/')) return;
        const seen = new Set<string>();
        for (const token of value.match(ID_TOKEN) ?? [])
            if (known.has(token) && !seen.has(token)) {
                seen.add(token);
                found(token, path);
            }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, i) => findAssetRefs(item, known, found, `${path}[${i}]`));
        return;
    }
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (typeof obj.assetId === 'string' && known.has(obj.assetId)) found(obj.assetId, path);
    for (const [key, child] of Object.entries(obj)) {
        if (key === 'assetId') continue;
        findAssetRefs(child, known, found, path ? `${path}.${key}` : key);
    }
}

function titleOf(data: Record<string, unknown> | undefined, schema?: ModelSchema): unknown {
    if (!data) return undefined;
    for (const key of TITLE_KEYS) if (data[key] != null) return data[key];
    const firstText = Object.entries(schema?.fields ?? {}).find(
        ([, f]) => f.type === 'core/text'
    )?.[0];
    return firstText ? data[firstText] : undefined;
}

const topField = (path: string) => path.split(/[.[]/)[0];

/**
 * Every place the project's assets are used, by asset id. One pass over all entries and pages,
 * so asking for one asset costs the same as asking for all of them.
 */
export async function assetUsage(
    user: User,
    projectId: string
): Promise<Map<string, AssetUsage[]>> {
    const known = new Set((await listAssets(projectId)).map(a => a.id));
    const usage = new Map<string, AssetUsage[]>();
    const add = (assetId: string, u: AssetUsage) => {
        const list = usage.get(assetId) ?? [];
        // One line per field: a gallery using the same picture twice is still one use.
        if (
            !list.some(
                x =>
                    x.kind === u.kind &&
                    x.field === u.field &&
                    (x.kind === 'entry' && u.kind === 'entry'
                        ? x.modelId === u.modelId && x.entryId === u.entryId
                        : x.kind === 'page' && u.kind === 'page' && x.pageId === u.pageId)
            )
        )
            list.push(u);
        usage.set(assetId, list);
    };
    if (known.size === 0) return usage;

    for (const schema of await listModelSchemas(user, projectId)) {
        for (const entry of await listEntries(user, projectId, schema.id)) {
            const title = titleOf(entry.data, schema);
            findAssetRefs(entry.data, known, (assetId, path) =>
                add(assetId, {
                    kind: 'entry',
                    modelId: schema.id,
                    entryId: entry.id,
                    status: entry.status,
                    title,
                    field: topField(path),
                    path
                })
            );
        }
    }
    for (const page of await listPages(projectId)) {
        const fields = (page as { fields?: Record<string, unknown> }).fields;
        if (!fields) continue;
        findAssetRefs(fields, known, (assetId, path) =>
            add(assetId, {
                kind: 'page',
                pageId: page.id,
                status: (page as { status?: string }).status,
                title: page.label,
                field: topField(path),
                path
            })
        );
    }
    return usage;
}
