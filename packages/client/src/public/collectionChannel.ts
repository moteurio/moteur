import type { MoteurClient } from '../client.js';

function qEntries(opts?: {
    resolveAssets?: boolean;
    resolveUrl?: boolean;
}): Record<string, string> | undefined {
    const o: Record<string, string> = {};
    if (opts?.resolveAssets) o.resolveAssets = '1';
    if (opts?.resolveUrl) o.resolveUrl = '1';
    return Object.keys(o).length ? o : undefined;
}

/**
 * Public collection channel: pages, entries, layouts, and forms exposed by a collection.
 * Paths match `GET` routes in `packages/api/src/projects/collections/public.ts`.
 */
export function createPublicCollectionChannel(
    client: MoteurClient,
    projectId: string,
    collectionId: string
) {
    const enc = encodeURIComponent;
    const root = `/projects/${enc(projectId)}/collections/${enc(collectionId)}`;

    return {
        pages: {
            list(options?: { resolveAssets?: boolean }): Promise<unknown> {
                const params = options?.resolveAssets ? { resolveAssets: '1' } : undefined;
                return client.get(`${root}/pages`, params);
            },
            getBySlug(slug: string, options?: { resolveAssets?: boolean }): Promise<unknown> {
                const params = options?.resolveAssets ? { resolveAssets: '1' } : undefined;
                return client.get(`${root}/pages/by-slug/${enc(slug)}`, params);
            },
            get(id: string, options?: { resolveAssets?: boolean }): Promise<unknown> {
                const params = options?.resolveAssets ? { resolveAssets: '1' } : undefined;
                return client.get(`${root}/pages/${enc(id)}`, params);
            }
        },

        entries: {
            list(resourceId: string, options?: { resolveAssets?: boolean; resolveUrl?: boolean }) {
                return client.get(`${root}/${enc(resourceId)}/entries`, qEntries(options));
            },
            get(
                resourceId: string,
                entryId: string,
                options?: { resolveAssets?: boolean; resolveUrl?: boolean }
            ) {
                return client.get(
                    `${root}/${enc(resourceId)}/entries/${enc(entryId)}`,
                    qEntries(options)
                );
            }
        },

        layouts: {
            list(): Promise<unknown> {
                return client.get(`${root}/layouts`);
            },
            get(id: string): Promise<unknown> {
                return client.get(`${root}/layouts/${enc(id)}`);
            }
        },

        forms: {
            list(): Promise<unknown> {
                return client.get(`${root}/forms`);
            },
            get(id: string): Promise<unknown> {
                return client.get(`${root}/forms/${enc(id)}`);
            }
        }
    };
}
