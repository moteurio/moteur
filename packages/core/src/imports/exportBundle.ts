/**
 * A project as an import bundle: its own schemas, files, pages, entries, menus and redirects.
 * Imported elsewhere it makes the same project: pictures become `$ref`s (their ids change when
 * they are stored again), and what is live says `published`, so it goes live there too. Files are
 * listed by address, or with `inlineFiles` carried in the bundle (base64): an address only this
 * server can reach (a local Moteur's) can't be fetched by another.
 */
import type { User } from '@moteurio/types/User.js';
import type { ImportBundle, ImportPage } from '@moteurio/types/Import.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { BlockSchema } from '@moteurio/types/Block.js';
import { getProject } from '../projects.js';
import { assertProjectAdmin } from '../contentAccess.js';
import { listModelSchemas } from '../models.js';
import { listTemplates } from '../templates.js';
import { listBlocks } from '../blocks.js';
import { listNavigations } from '../navigations.js';
import { listRedirects } from '../redirects.js';
import { listAssets } from '../assets/assetService.js';
import { getProjectAdapter } from '../assets/adapterRegistry.js';
import { projectRecords } from '../contentReferences.js';
import { getProjectJson, listProjectKeys } from '../utils/projectStorage.js';
import { structureKey, structureListPrefix } from '../utils/storageKeys.js';

/** `assetId: "<id>"` of an exported file becomes `assetId: { "$ref": "asset:<id>" }`. */
function assetRefs(value: unknown, ids: Set<string>): unknown {
    if (Array.isArray(value)) return value.map(v => assetRefs(v, ids));
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                k,
                k === 'assetId' && typeof v === 'string' && ids.has(v)
                    ? { $ref: `asset:${v}` }
                    : assetRefs(v, ids)
            ])
        );
    return value;
}

const textOf = (v: unknown) =>
    typeof v === 'string'
        ? v
        : v && typeof v === 'object'
          ? (Object.values(v).find(x => typeof x === 'string') as string | undefined)
          : undefined;

export type ExportOptions = {
    /** Each file's content in the bundle (base64), instead of its address. */
    inlineFiles?: boolean;
};

export async function exportBundle(
    user: User,
    projectId: string,
    options: ExportOptions = {}
): Promise<ImportBundle> {
    const project = await getProject(user, projectId);
    assertProjectAdmin(user, 'export the project');
    const structures: StructureSchema[] = [];
    for (const id of await listProjectKeys(projectId, structureListPrefix())) {
        const s = await getProjectJson<StructureSchema>(projectId, structureKey(id));
        if (s) structures.push(s);
    }
    // The project's own blocks (named without a namespace): the server's are there wherever it's imported.
    const blocks = Object.values(listBlocks(projectId)).filter(
        b => !b.type.includes('/')
    ) as BlockSchema[];
    const assets = (await listAssets(projectId)).filter(a => !a.deletedAt && a.url);
    const ids = new Set(assets.map(a => a.id));
    const { entries, pages } = await projectRecords(projectId);

    const byModel: NonNullable<ImportBundle['entries']> = {};
    for (const { entry, schema } of entries)
        (byModel[schema.id] ??= []).push({
            id: entry.id,
            data: assetRefs(entry.data ?? {}, ids) as Record<string, unknown>,
            ...(entry.languages && { languages: entry.languages }),
            ...(entry.status === 'published' && { published: true })
        });

    const adapter = options.inlineFiles ? getProjectAdapter(project) : undefined;
    const fileOf = async (a: (typeof assets)[number]) => {
        // A video kept only by its host has no file here: its address it is.
        if (adapter && a.path)
            return { content: (await adapter.download(a.path)).toString('base64') };
        return { url: a.url! };
    };

    return {
        version: 1,
        structures,
        blocks,
        models: await listModelSchemas(user, projectId),
        templates: await listTemplates(projectId),
        assets: await Promise.all(
            assets.map(async a => ({
                ref: a.id,
                ...(await fileOf(a)),
                name: a.filename,
                ...(a.folder && { folder: a.folder }),
                ...(textOf(a.alt) && { alt: textOf(a.alt) }),
                ...(textOf(a.title) && { title: textOf(a.title) }),
                ...(a.credit && { credit: a.credit })
            }))
        ),
        pages: pages.map(p => {
            const page = p as typeof p & Record<string, unknown>;
            const out: ImportPage = {
                id: p.id,
                type: p.type,
                label: p.label,
                slug: p.slug,
                ...(p.slugs && { slugs: p.slugs }),
                ...(p.parentId && { parent: p.parentId }),
                order: p.order,
                navInclude: p.navInclude,
                ...(p.navLabel && { navLabel: p.navLabel }),
                sitemapInclude: p.sitemapInclude,
                ...(p.languages && { languages: p.languages })
            };
            if (p.type !== 'folder') {
                out.templateId = p.templateId;
                out.fields = assetRefs(p.fields ?? {}, ids) as Record<string, unknown>;
                if (p.status === 'published') out.published = true;
            }
            if (p.type === 'collection') {
                out.modelId = page.modelId as string;
                if (page.urlPattern) out.urlPattern = page.urlPattern as string;
            }
            return out;
        }),
        entries: byModel,
        menus: (await listNavigations(projectId)).map(n => ({
            handle: n.handle,
            label: n.name,
            ...(n.type && { type: n.type }),
            maxDepth: n.maxDepth,
            ...(n.itemSchema && { itemSchema: n.itemSchema }),
            items: assetRefs(n.items, ids) as unknown[]
        })),
        // Moteur's own redirects come back as addresses change: only the ones people made.
        redirects: (await listRedirects(projectId))
            .filter(r => !r.auto)
            .map(r => ({
                from: r.from,
                to: r.to,
                status: r.status,
                ...(r.note && { note: r.note })
            }))
    };
}
