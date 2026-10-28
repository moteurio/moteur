/**
 * A bundle saved all at once, or not at all: its schemas, files, pages, entries, menus and
 * redirects are saved in one batch (one commit, one webhook, one Radar scan), and any failure
 * puts every file back as it was. A dry run saves it all the same way, then undoes it.
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { User } from '@moteurio/types/User.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';
import type {
    ImportBundle,
    ImportIssue,
    ImportItemKind,
    ImportItemResult,
    ImportPage
} from '@moteurio/types/Import.js';
import { needsApproval } from '@moteurio/types';
import { runInBatch, type ContentBatch } from '../contentBatch.js';
import { commitContentChange } from '../git/contentCommitHook.js';
import { isGitRepo, show } from '../git/gitService.js';
import { projectDir } from '../utils/pathUtils.js';
import { withProjectWriteLock } from '../utils/projectWriteLock.js';
import { hasProjectKey, restoreProjectFile } from '../utils/projectStorage.js';
import { pageKey, structureKey } from '../utils/storageKeys.js';
import { isValidId } from '../utils/idUtils.js';
import { downloadPublicFile } from '../utils/publicDownload.js';
import { getProject } from '../projects.js';
import { createStructure, updateStructure } from '../structures.js';
import { createProjectBlock, updateProjectBlock } from '../blocks.js';
import { createModelSchema, getModelSchemaForProject, updateModelSchema } from '../models.js';
import { createTemplate, getTemplate, updateTemplate } from '../templates.js';
import { createPage, getPage, updatePage } from '../pages.js';
import { createEntry, getEntryForProject, publishEntry, updateEntry } from '../entries.js';
import { createNavigation, getNavigationByHandle, updateNavigation } from '../navigations.js';
import { createRedirect, listRedirects, normalizePath, updateRedirect } from '../redirects.js';
import {
    discardImportedAssets,
    fileHash,
    getAsset,
    listAssets,
    uploadAsset
} from '../assets/assetService.js';
import { log, toActivityEvent } from '../activityLogger.js';
import { dispatch as webhookDispatch } from '../webhooks/webhookService.js';
import { runFullScan } from '../radar/index.js';
import { withOwnBlocks } from './ownBlocks.js';

/** The asset list is undone by taking out what was added, not by putting the file back. */
const ASSETS_KEY = 'assets.json';

const uploadMaxBytes = () =>
    Math.max(1, parseInt(process.env.API_UPLOAD_MAX_MB || '50', 10) || 50) * 1024 * 1024;

export type ImportProgress = (done: number, total: number) => void;

export type ImportOptions = {
    dryRun?: boolean;
    onProgress?: ImportProgress;
    /** The files changed so far, after each item: what a job keeps, to undo after a crash. */
    onTouched?: (paths: string[]) => void;
};

export type ImportOutcome = {
    status: 'done' | 'failed' | 'awaiting_approval';
    dryRun: boolean;
    items: ImportItemResult[];
    issues: ImportIssue[];
    commit?: string;
    toPublish?: { pages: string[]; entries: { modelId: string; id: string }[] };
};

class ImportError extends Error {
    constructor(
        readonly path: string,
        message: string
    ) {
        super(message);
    }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** How many things the bundle saves. */
export function countItems(bundle: ImportBundle): number {
    return (
        (bundle.structures?.length ?? 0) +
        (bundle.blocks?.length ?? 0) +
        (bundle.models?.length ?? 0) +
        (bundle.templates?.length ?? 0) +
        (bundle.assets?.length ?? 0) +
        (bundle.pages?.length ?? 0) +
        Object.values(bundle.entries ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0) +
        (bundle.menus?.length ?? 0) +
        (bundle.redirects?.length ?? 0)
    );
}

/** What is wrong with the bundle's shape, before anything is saved. */
export function checkBundle(bundle: unknown): ImportIssue[] {
    const issues: ImportIssue[] = [];
    const add = (path: string, message: string) => issues.push({ path, message });
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
        add('', 'The bundle must be an object.');
        return issues;
    }
    const b = bundle as ImportBundle;
    if (b.version !== 1) add('version', 'The bundle needs "version": 1.');
    if (b.existing && !['update', 'skip', 'fail'].includes(b.existing))
        add('existing', '"existing" is update, skip or fail.');
    const lists = [
        'structures',
        'blocks',
        'models',
        'templates',
        'assets',
        'pages',
        'menus',
        'redirects'
    ] as const;
    for (const key of lists)
        if (b[key] !== undefined && !Array.isArray(b[key])) add(key, `"${key}" must be a list.`);
    if (b.entries !== undefined && (typeof b.entries !== 'object' || Array.isArray(b.entries)))
        add('entries', '"entries" lists entries by model id.');
    if (issues.length) return issues;

    const seen = (kind: string) => {
        const names = new Set<string>();
        return (name: string, at: string) => {
            if (names.has(name)) add(at, `Two ${kind} are named "${name}".`);
            names.add(name);
        };
    };
    const assetRef = seen('files');
    (b.assets ?? []).forEach((a, i) => {
        const at = `assets[${i}]`;
        if (!a?.ref) return add(at, 'A file needs a ref.');
        assetRef(a.ref, at);
        if (!!a.url === !!a.content) add(at, 'A file has a url or a content, not both.');
        if (a.content && !a.name) add(`${at}.name`, 'A file given inline needs its name.');
        if (a.url && !/^https:\/\//i.test(a.url)) add(`${at}.url`, 'Only HTTPS addresses.');
    });
    const pageRef = seen('pages');
    (b.pages ?? []).forEach((p, i) => {
        const at = `pages[${i}]`;
        if (!p || typeof p !== 'object') return add(at, 'A page is an object.');
        if (p.id !== undefined && !isValidId(p.id)) add(`${at}.id`, `"${p.id}" is not a valid id.`);
        if (typeof p.label !== 'string' || !p.label) add(`${at}.label`, 'A page needs a label.');
        if (typeof p.slug !== 'string') add(`${at}.slug`, 'A page needs a slug ("" for the home).');
        if ((p.type ?? 'static') !== 'folder' && !p.templateId)
            add(`${at}.templateId`, 'A page needs its template.');
        pageRef(p.ref ?? p.id ?? `#${i}`, at);
    });
    for (const [modelId, list] of Object.entries(b.entries ?? {})) {
        if (!Array.isArray(list)) {
            add(`entries.${modelId}`, 'A list of entries.');
            continue;
        }
        const entryRef = seen(`${modelId} entries`);
        list.forEach((e, i) => {
            const at = `entries.${modelId}[${i}]`;
            if (!e?.id || !isValidId(e.id)) add(`${at}.id`, 'An entry needs a valid id.');
            if (!e?.data || typeof e.data !== 'object') add(`${at}.data`, 'An entry needs data.');
            entryRef(e?.ref ?? e?.id, at);
        });
    }
    (b.menus ?? []).forEach((m, i) => {
        if (!m?.handle) add(`menus[${i}].handle`, 'A menu needs a handle.');
    });
    (b.redirects ?? []).forEach((r, i) => {
        if (!r?.from || !r?.to) add(`redirects[${i}]`, 'A redirect needs from and to.');
    });
    return issues;
}

/** Ids of what the bundle names, by `kind:name`. */
type Refs = Map<string, string>;

const isRef = (v: unknown): v is { $ref: string } =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === 1 &&
    typeof (v as { $ref?: unknown }).$ref === 'string';

/** `{ "$ref": "page:pricing" }` anywhere in a value becomes the id it names. */
function resolveRefs(value: unknown, refs: Refs, at: string): unknown {
    if (isRef(value)) {
        const id = refs.get(value.$ref);
        if (!id)
            throw new ImportError(at, `Nothing in the bundle or the project is "${value.$ref}".`);
        return id;
    }
    if (Array.isArray(value)) return value.map((v, i) => resolveRefs(v, refs, `${at}[${i}]`));
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, resolveRefs(v, refs, `${at}.${k}`)])
        );
    return value;
}

/** Refs to things the project already has (not in the bundle): accepted by their id. */
async function addProjectRefs(projectId: string, bundle: ImportBundle, refs: Refs) {
    const wanted = new Set<string>();
    const collect = (v: unknown) => {
        if (isRef(v)) wanted.add(v.$ref);
        else if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(bundle);
    for (const p of bundle.pages ?? [])
        if (typeof p.parent === 'string') wanted.add(`page:${p.parent}`);
    for (const ref of wanted) {
        if (refs.has(ref)) continue;
        const [kind, name] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
        if (kind === 'page' && isValidId(name) && (await hasProjectKey(projectId, pageKey(name))))
            refs.set(ref, name);
        if (kind === 'asset' && (await getAsset(projectId, name).catch(() => null)))
            refs.set(ref, name);
        if (kind === 'entry') {
            const [modelId, id] = name.split('/');
            if (
                modelId &&
                id &&
                (await getEntryForProject(projectId, modelId, id).catch(() => null))
            )
                refs.set(ref, id);
        }
    }
}

/** Pages with parents in the bundle come after them. */
function inTreeOrder(pages: (ImportPage & { id: string })[], refs: Refs): typeof pages {
    const ids = new Set(pages.map(p => p.id));
    const parentOf = (p: ImportPage) => {
        const ref = typeof p.parent === 'string' ? `page:${p.parent}` : p.parent?.$ref;
        return ref ? refs.get(ref) : undefined;
    };
    const out: typeof pages = [];
    const placed = new Set<string>();
    const visit = (p: (typeof pages)[number], trail: Set<string>) => {
        if (placed.has(p.id)) return;
        if (trail.has(p.id)) throw new ImportError('pages', `Page "${p.id}" is its own ancestor.`);
        const parent = parentOf(p);
        if (parent && ids.has(parent))
            visit(
                pages.find(q => q.id === parent)!,
                new Set(trail).add(p.id)
            );
        placed.add(p.id);
        out.push(p);
    };
    for (const p of pages) visit(p, new Set());
    return out;
}

/** The file of an asset given in the bundle. */
async function fileOf(a: NonNullable<ImportBundle['assets']>[number]) {
    if (a.url) {
        const got = await downloadPublicFile(a.url, { maxBytes: uploadMaxBytes() });
        return { buffer: got.buffer, name: a.name ?? got.name, mimeType: got.mimeType };
    }
    const base64 = String(a.content)
        .replace(/^data:[^,]*;base64,/, '')
        .replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('content is not base64.');
    return {
        buffer: Buffer.from(base64, 'base64'),
        name: a.name!,
        mimeType: 'application/octet-stream'
    };
}

type Context = {
    user: User;
    projectId: string;
    bundle: ImportBundle;
    dryRun: boolean;
    refs: Refs;
    items: ImportItemResult[];
    issues: ImportIssue[];
    createdAssets: string[];
    batch: ContentBatch;
    tick: () => void;
};

/**
 * Saves one thing. In a dry run a failure is noted and the run goes on (it is all undone
 * anyway); otherwise it stops the import.
 */
async function step(
    ctx: Context,
    at: string,
    kind: ImportItemKind,
    work: () => Promise<{ id: string; action: ImportItemResult['action'] }>
) {
    try {
        const done = await work();
        ctx.items.push({ kind, ...done });
    } catch (err) {
        const where = err instanceof ImportError ? err.path : at;
        if (!ctx.dryRun) throw new ImportError(where, messageOf(err));
        ctx.issues.push({ path: where, message: messageOf(err) });
    } finally {
        ctx.tick();
    }
}

/** What to do with something already there: update, skip, or refuse. */
function whenExisting(ctx: Context, what: string): 'update' | 'skip' {
    const rule = ctx.bundle.existing ?? 'update';
    if (rule === 'fail') throw new Error(`${what} already exists.`);
    return rule;
}

/** A project block's file name, as `createProjectBlock` makes it. */
const BLOCK_SLUG = /^[a-z0-9][a-z0-9-_]*$/;

async function saveAll(ctx: Context): Promise<void> {
    const { user, projectId, bundle, refs } = ctx;

    for (const [i, s] of (bundle.structures ?? []).entries())
        await step(ctx, `structures[${i}]`, 'structure', async () => {
            if (await hasProjectKey(projectId, structureKey(s.type))) {
                if (whenExisting(ctx, `Structure "${s.type}"`) === 'skip')
                    return { id: s.type, action: 'skip' };
                await updateStructure(projectId, s.type, s, user);
                return { id: s.type, action: 'update' };
            }
            await createStructure(projectId, s, user);
            return { id: s.type, action: 'create' };
        });

    for (const [i, b] of (bundle.blocks ?? []).entries())
        await step(ctx, `blocks[${i}]`, 'block', async () => {
            const slug = b.type.includes('/') ? b.type.slice(b.type.indexOf('/') + 1) : b.type;
            if (!BLOCK_SLUG.test(slug)) throw new Error(`"${b.type}" is not a block type.`);
            const key = `blocks/${slug}.json`;
            if (fs.existsSync(path.join(projectDir(projectId), key))) {
                if (whenExisting(ctx, `Block "${b.type}"`) === 'skip')
                    return { id: b.type, action: 'skip' };
                updateProjectBlock(projectId, slug, b, 'replace');
                // Block files are not content events: the batch is told of them, once written.
                ctx.batch.paths.add(key);
                return { id: b.type, action: 'update' };
            }
            const made = createProjectBlock(projectId, b);
            ctx.batch.paths.add(key);
            return { id: made.type, action: 'create' };
        });

    for (const [i, m] of (bundle.models ?? []).entries())
        await step(ctx, `models[${i}]`, 'model', async () => {
            if (await getModelSchemaForProject(projectId, m.id)) {
                if (whenExisting(ctx, `Model "${m.id}"`) === 'skip')
                    return { id: m.id, action: 'skip' };
                await updateModelSchema(user, projectId, m.id, m);
                return { id: m.id, action: 'update' };
            }
            await createModelSchema(user, projectId, m);
            return { id: m.id, action: 'create' };
        });

    for (const [i, t] of (bundle.templates ?? []).entries())
        await step(ctx, `templates[${i}]`, 'template', async () => {
            if (await getTemplate(projectId, t.id).catch(() => null)) {
                if (whenExisting(ctx, `Template "${t.id}"`) === 'skip')
                    return { id: t.id, action: 'skip' };
                await updateTemplate(projectId, user, t.id, t);
                return { id: t.id, action: 'update' };
            }
            await createTemplate(projectId, user, t);
            return { id: t.id, action: 'create' };
        });

    for (const [i, a] of (bundle.assets ?? []).entries())
        await step(ctx, `assets[${i}]`, 'asset', async () => {
            if (ctx.dryRun) {
                // Not downloaded nor stored in a dry run: a stand-in id lets the rest be checked.
                refs.set(`asset:${a.ref}`, `dry-run-${a.ref}`);
                return { id: `dry-run-${a.ref}`, action: 'create' };
            }
            const file = await fileOf(a);
            // The same file already in the library is used again, not added twice.
            const same = (await listAssets(projectId, { hash: fileHash(file.buffer) })).find(
                x => !x.deletedAt
            );
            if (same) {
                refs.set(`asset:${a.ref}`, same.id);
                return { id: same.id, action: 'skip' };
            }
            const asset = await uploadAsset(
                projectId,
                user,
                { buffer: file.buffer, originalName: file.name, mimeType: file.mimeType },
                { folder: a.folder, alt: a.alt, title: a.title, credit: a.credit }
            );
            ctx.createdAssets.push(asset.id);
            refs.set(`asset:${a.ref}`, asset.id);
            return { id: asset.id, action: 'create' };
        });

    // Ids are known before any page is saved, so pages can point at each other.
    const pages = (bundle.pages ?? []).map(p => ({ ...p, id: p.id ?? randomUUID() }));
    pages.forEach(p => refs.set(`page:${p.ref ?? p.id}`, p.id));
    for (const [modelId, list] of Object.entries(bundle.entries ?? {}))
        for (const e of list) refs.set(`entry:${modelId}/${e.ref ?? e.id}`, e.id);
    await addProjectRefs(projectId, bundle, refs);

    const at = new Map(bundle.pages?.map((p, i) => [p, `pages[${i}]`]) ?? []);
    for (const p of inTreeOrder(pages, refs)) {
        const where = at.get((bundle.pages ?? [])[pages.indexOf(p)]!) ?? 'pages';
        await step(ctx, where, 'page', async () => {
            const parentRef = typeof p.parent === 'string' ? `page:${p.parent}` : p.parent?.$ref;
            const parentId = parentRef ? refs.get(parentRef) : null;
            if (parentRef && !parentId)
                throw new ImportError(`${where}.parent`, `No page "${parentRef}".`);
            // An import saves drafts: going live is its `publish` step, never a page's own fields.
            const {
                id,
                ref: _ref,
                parent: _parent,
                fields,
                status: _status,
                publishedCommit: _commit,
                publishedAt: _at,
                ...rest
            } = p as typeof p & {
                status?: unknown;
                publishedCommit?: unknown;
                publishedAt?: unknown;
            };
            const data = {
                ...rest,
                type: p.type ?? 'static',
                parentId: parentId ?? null,
                ...(fields !== undefined && {
                    fields: resolveRefs(fields, refs, `${where}.fields`) as Record<string, unknown>
                })
            } as Partial<PageNode> & { type: PageNode['type']; label: string; slug: string };
            if (await hasProjectKey(projectId, pageKey(id))) {
                if (whenExisting(ctx, `Page "${id}"`) === 'skip') return { id, action: 'skip' };
                // A live page keeps its published version: the import's changes wait in it.
                await updatePage(projectId, user, id, data, { asDraft: true });
                return { id, action: 'update' };
            }
            await createPage(projectId, user, { ...data, id, status: 'draft' } as typeof data);
            return { id, action: 'create' };
        });
    }

    for (const [modelId, list] of Object.entries(bundle.entries ?? {}))
        for (const [i, e] of list.entries()) {
            const where = `entries.${modelId}[${i}]`;
            await step(ctx, where, 'entry', async () => {
                const data = resolveRefs(e.data, refs, `${where}.data`) as Entry['data'];
                const key = `${modelId}/${e.id}`;
                if (await getEntryForProject(projectId, modelId, e.id).catch(() => null)) {
                    if (whenExisting(ctx, `Entry "${key}"`) === 'skip')
                        return { id: key, action: 'skip' };
                    await updateEntry(user, projectId, modelId, e.id, { data });
                    return { id: key, action: 'update' };
                }
                await createEntry(user, projectId, modelId, {
                    id: e.id,
                    type: modelId,
                    status: 'draft',
                    data
                } as Entry);
                return { id: key, action: 'create' };
            });
        }

    for (const [i, m] of (bundle.menus ?? []).entries())
        await step(ctx, `menus[${i}]`, 'menu', async () => {
            const { handle, label, ...rest } = resolveRefs(m, refs, `menus[${i}]`) as typeof m;
            const name =
                typeof label === 'string'
                    ? label
                    : typeof (rest as { name?: unknown }).name === 'string'
                      ? String((rest as { name?: unknown }).name)
                      : handle;
            const current = await getNavigationByHandle(projectId, handle);
            if (current) {
                if (whenExisting(ctx, `Menu "${handle}"`) === 'skip')
                    return { id: handle, action: 'skip' };
                await updateNavigation(projectId, user, current.id, { ...rest, name } as never);
                return { id: handle, action: 'update' };
            }
            await createNavigation(projectId, user, { ...rest, name, handle } as never);
            return { id: handle, action: 'create' };
        });

    const redirects = await listRedirects(projectId);
    for (const [i, r] of (bundle.redirects ?? []).entries())
        await step(ctx, `redirects[${i}]`, 'redirect', async () => {
            const from = normalizePath(r.from) ?? r.from;
            const current = redirects.find(x => x.from === from);
            if (current) {
                if (whenExisting(ctx, `Redirect from "${from}"`) === 'skip')
                    return { id: from, action: 'skip' };
                await updateRedirect(projectId, user, current.id, r);
                return { id: from, action: 'update' };
            }
            await createRedirect(projectId, user, r);
            return { id: from, action: 'create' };
        });
}

/** Every file the batch changed, as it was before; and the files it added, taken back. */
async function undo(projectId: string, batch: ContentBatch, createdAssets: string[]) {
    await discardImportedAssets(projectId, createdAssets);
    const dir = projectDir(projectId);
    for (const key of batch.paths) {
        if (key !== ASSETS_KEY) await restoreProjectFile(projectId, key, show(dir, 'HEAD', key));
    }
    // A list the import began, empty again: as if it never was.
    const before = show(dir, 'HEAD', ASSETS_KEY);
    if (before === null && (await listAssets(projectId, { includeBinned: true })).length === 0)
        await restoreProjectFile(projectId, ASSETS_KEY, null);
}

const summary = (items: ImportItemResult[]) => {
    const made = items.filter(i => i.action !== 'skip');
    const count = (kind: string, word: string) => {
        const n = made.filter(i => i.kind === kind).length;
        return n ? `${n} ${word}${n > 1 ? 's' : ''}` : '';
    };
    return (
        [
            count('page', 'page'),
            count('entry', 'entry'),
            count('asset', 'file'),
            count('model', 'model'),
            count('template', 'template'),
            count('block', 'block'),
            count('structure', 'structure'),
            count('menu', 'menu'),
            count('redirect', 'redirect')
        ]
            .filter(Boolean)
            .join(', ')
            .replace(/entrys/g, 'entries') || 'nothing new'
    );
};

/**
 * Saves the bundle, all of it or none of it. With `publish`, its pages and entries then go live,
 * unless the person (or agent) needs approval: the import then waits for one (see
 * `publishImport`).
 */
export async function importBundle(
    user: User,
    projectId: string,
    bundle: ImportBundle,
    options: ImportOptions = {}
): Promise<ImportOutcome> {
    const dryRun = options.dryRun === true;
    const issues = checkBundle(bundle);
    if (issues.length) return { status: 'failed', dryRun, items: [], issues };
    const project = await getProject(user, projectId);
    if (!isGitRepo(projectDir(projectId)))
        return {
            status: 'failed',
            dryRun,
            items: [],
            issues: [{ path: '', message: 'Importing needs the project’s Git history (to undo).' }]
        };

    const total = countItems(bundle);
    let done = 0;
    const outcome = await withProjectWriteLock<ImportOutcome>(projectId, async () => {
        const saved = await runInBatch(projectId, async batch => {
            const ctx: Context = {
                user,
                projectId,
                bundle: withOwnBlocks(bundle, projectId),
                dryRun,
                refs: new Map(),
                items: [],
                issues: [],
                createdAssets: [],
                batch,
                tick: () => {
                    options.onProgress?.(++done, total);
                    options.onTouched?.([...batch.paths]);
                }
            };
            try {
                await saveAll(ctx);
            } catch (err) {
                await undo(projectId, batch, ctx.createdAssets);
                const issue =
                    err instanceof ImportError
                        ? { path: err.path, message: err.message }
                        : { path: '', message: messageOf(err) };
                return { ok: false as const, ctx, issues: [issue] };
            }
            if (dryRun || ctx.issues.length) {
                await undo(projectId, batch, ctx.createdAssets);
                return { ok: false as const, ctx, issues: ctx.issues };
            }
            return { ok: true as const, ctx, paths: [...batch.paths] };
        });
        if (!saved.ok)
            return {
                status: (dryRun && !saved.issues.length
                    ? 'done'
                    : 'failed') as ImportOutcome['status'],
                dryRun,
                items: saved.ctx.items,
                issues: saved.issues
            };
        const commit = await commitContentChange({
            projectId,
            paths: saved.paths,
            message: `Import ${summary(saved.ctx.items)} — ${user.name ?? user.id}`,
            user
        });
        return {
            status: 'done' as const,
            dryRun,
            items: saved.ctx.items,
            issues: [],
            ...(commit && { commit })
        };
    });
    if (dryRun || outcome.status !== 'done') return outcome;

    log(
        toActivityEvent(projectId, 'project', projectId, 'updated', user, undefined, {
            import: summary(outcome.items),
            commit: outcome.commit
        })
    );
    const toPublish = bundle.publish
        ? {
              // Folders have nothing to publish: publishImport passes them by.
              pages: outcome.items
                  .filter(i => i.kind === 'page' && i.action !== 'skip')
                  .map(i => i.id),
              entries: outcome.items
                  .filter(i => i.kind === 'entry' && i.action !== 'skip')
                  .map(i => ({ modelId: i.id.split('/')[0]!, id: i.id.split('/')[1]! }))
          }
        : undefined;
    if (toPublish && needsApproval(user, project))
        return { ...outcome, status: 'awaiting_approval', toPublish };
    const published = toPublish ? await publishImport(user, projectId, toPublish) : [];
    await afterImport(projectId, outcome.items, outcome.commit);
    return {
        ...outcome,
        ...(toPublish && { toPublish }),
        issues: published
    };
}

/**
 * Puts an import's pages and entries live: each page as publishing makes it (its own commit, its
 * waiting changes included), then the entries in one commit. What can't go live is reported, not
 * undone.
 */
export async function publishImport(
    user: User,
    projectId: string,
    toPublish: NonNullable<ImportOutcome['toPublish']>
): Promise<ImportIssue[]> {
    const issues: ImportIssue[] = [];
    await withProjectWriteLock(projectId, async () => {
        // A page's published version is the commit holding it: pages are not batched.
        for (const id of toPublish.pages) {
            try {
                const page = await getPage(projectId, id);
                if (page.type !== 'folder')
                    await updatePage(projectId, user, id, { status: 'published' });
            } catch (err) {
                issues.push({ path: `page:${id}`, message: messageOf(err) });
            }
        }
        const paths = await runInBatch(projectId, async batch => {
            for (const e of toPublish.entries) {
                try {
                    await publishEntry(user, projectId, e.modelId, e.id);
                } catch (err) {
                    issues.push({ path: `entry:${e.modelId}/${e.id}`, message: messageOf(err) });
                }
            }
            return [...batch.paths];
        });
        await commitContentChange({
            projectId,
            paths,
            message: `Publish ${toPublish.entries.length} entries — ${user.name ?? user.id}`,
            user
        });
    });
    return issues;
}

/** One webhook and one Radar scan for the whole import. */
export async function afterImport(
    projectId: string,
    items: ImportItemResult[],
    commit?: string
): Promise<void> {
    try {
        await webhookDispatch(
            'import.completed',
            { import: { summary: summary(items), items, commit } } as never,
            { projectId, source: 'api' }
        );
    } catch {
        // never fail an import on a webhook
    }
    void runFullScan(projectId, { source: 'api' }).catch(() => undefined);
}
