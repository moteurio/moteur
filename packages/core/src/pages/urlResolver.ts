import type {
    PageNode,
    PageNodeType,
    StaticPage,
    CollectionPage,
    PageStatus
} from '@moteurio/types/Page.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { LocalePrefix } from '@moteurio/types/Project.js';

/** One language to resolve addresses in. Without it, addresses use the default slugs, unprefixed. */
export type UrlLanguage = { locale: string; defaultLocale: string; prefix?: LocalePrefix };

/** Every language of a project, to resolve each address once per language. */
export type UrlLanguages = { locales: string[]; defaultLocale: string; prefix?: LocalePrefix };

export type ResolvedUrl = {
    url: string;
    nodeId: string;
    nodeType: PageNodeType;
    label: string;
    navInclude: boolean;
    navLabel?: string;
    sitemapInclude: boolean;
    sitemapPriority: number;
    sitemapChangefreq?: string;
    entryId?: string;
    modelId?: string;
    /** Set when the project's languages were given: the language of this address. */
    locale?: string;
    /** The same page or entry in every language, by locale (this address included). */
    alternates?: Record<string, string>;
};

/** A page's address segment in a language: its translated slug, or the default one. */
export function slugIn(node: PageNode, lang?: UrlLanguage): string {
    if (!lang || lang.locale === lang.defaultLocale) return node.slug;
    const translated = node.slugs?.[lang.locale];
    return typeof translated === 'string' && translated !== '' ? translated : node.slug;
}

/** Add the language prefix the project asks for: /fr/a-propos, or /a-propos with `none`. */
export function withLocale(path: string, lang?: UrlLanguage): string {
    if (!lang) return path;
    const prefix = lang.prefix ?? 'others';
    if (prefix === 'none' || (prefix === 'others' && lang.locale === lang.defaultLocale))
        return path;
    const code = `/${lang.locale.toLowerCase()}`;
    return path === '/' || path === '' ? code : `${code}${path}`;
}

/** Join a path and a segment: ('/', 'x') → '/x', ('/blog', 'x') → '/blog/x'. */
export function joinPath(prefix: string, segment: string): string {
    const clean = segment.replace(/^\/+|\/+$/g, '');
    if (!clean) return prefix || '/';
    return !prefix || prefix === '/' ? `/${clean}` : `${prefix}/${clean}`;
}

function languagesList(languages: UrlLanguages): UrlLanguage[] {
    const locales = [
        languages.defaultLocale,
        ...languages.locales.filter(l => l && l !== languages.defaultLocale)
    ];
    return [...new Set(locales)].map(locale => ({
        locale,
        defaultLocale: languages.defaultLocale,
        prefix: languages.prefix
    }));
}

/** Build a map of id → PageNode for O(1) lookup */
export function buildNodeMap(nodes: PageNode[]): Map<string, PageNode> {
    const map = new Map<string, PageNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
}

/** Build a map of parentId → children[], sorted by order */
export function buildChildMap(nodes: PageNode[]): Map<string | null, PageNode[]> {
    const map = new Map<string | null, PageNode[]>();
    map.set(null, []);
    for (const n of nodes) {
        const pid = n.parentId ?? null;
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(n);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
    return map;
}

/** Walk up from a node to root, returning the ancestor chain (closest ancestor first, root last) */
export function getAncestors(nodeId: string, nodeMap: Map<string, PageNode>): PageNode[] {
    const out: PageNode[] = [];
    let node = nodeMap.get(nodeId);
    while (node?.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (!parent) break;
        out.push(parent);
        node = parent;
    }
    return out.reverse();
}

/** A node's path from the root in one language, without the language prefix. */
function nodePath(nodeId: string, nodeMap: Map<string, PageNode>, lang?: UrlLanguage): string {
    const ancestors = getAncestors(nodeId, nodeMap);
    const node = nodeMap.get(nodeId);
    const segments: string[] = [];
    for (const a of [...ancestors, ...(node ? [node] : [])]) {
        const slug = slugIn(a, lang);
        if (slug) segments.push(slug);
    }
    return segments.length === 0 ? '/' : '/' + segments.join('/');
}

/** Resolve the full URL prefix for a node by walking up the tree. Root-level nodes with slug '' contribute nothing. Returns a string beginning with '/' e.g. '/blog', '/shop/products'; with a language, its slugs and prefix ('/fr/boutique/produits'). */
export function resolveNodePrefix(
    nodeId: string,
    nodeMap: Map<string, PageNode>,
    lang?: UrlLanguage
): string {
    return withLocale(nodePath(nodeId, nodeMap, lang), lang);
}

/** Text from a value: a string or number as is; a value per language in `lang`, else the default, else the first. */
function textIn(value: unknown, lang?: UrlLanguage): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value !== 'object' || Array.isArray(value)) return '';
    const map = value as Record<string, unknown>;
    for (const locale of [lang?.locale, lang?.defaultLocale]) {
        const v = locale ? map[locale] : undefined;
        if (typeof v === 'string' && v !== '') return v;
    }
    const first = Object.values(map).find(v => typeof v === 'string' && v !== '');
    return typeof first === 'string' ? first : '';
}

/** Get a value from entry.data by dot path. Supports nested objects; a string/number is returned as is, and a value per language in `lang`; anything else is ''.
 * Never throws — unknown paths return ''. */
function getDataByPath(data: Record<string, unknown>, path: string, lang?: UrlLanguage): string {
    const parts = path.trim().split('.');
    let current: unknown = data;
    for (const p of parts) {
        if (current == null || typeof current !== 'object') return '';
        current = (current as Record<string, unknown>)[p];
    }
    return textIn(current, lang);
}

/** Interpolate a URL pattern against an entry's data. Supports dot notation: '[category.slug]' reads entry.data.category.slug or entry.data.category (if string). A translated field gives its text in `lang`. Unknown references resolve to '' (never throw). */
export function interpolatePattern(pattern: string, entry: Entry, lang?: UrlLanguage): string {
    return pattern.replace(/\[([^\]]+)\]/g, (_, ref: string) => {
        const trimmed = ref.trim();
        if (!trimmed) return '';
        return getDataByPath(entry.data ?? {}, trimmed, lang);
    });
}

type EmitRow = (node: PageNode, url: string, entryId?: string, modelId?: string) => void;

/**
 * Resolve all public URLs for sitemap / listing. With the project's languages, every page and
 * entry has one address per language, each listing the others as `alternates`. Under the `none`
 * prefix, a language whose address is the default's is left out (it is the same page).
 */
export async function resolveAllUrls(
    nodes: PageNode[],
    getEntries: (projectId: string, modelId: string, status?: PageStatus) => Promise<Entry[]>,
    projectId: string,
    languages?: UrlLanguages
): Promise<ResolvedUrl[]> {
    const results: ResolvedUrl[] = [];
    const childMap = buildChildMap(nodes);

    const collectionNodes = nodes.filter((n): n is CollectionPage => n.type === 'collection');

    const entryLists = await Promise.all(
        collectionNodes.map(cn => getEntries(projectId, cn.modelId, cn.entryStatus))
    );

    function walkIn(lang: UrlLanguage | undefined): ResolvedUrl[] {
        const rows: ResolvedUrl[] = [];
        const emit: EmitRow = (node, path, entryId, modelId) => {
            rows.push({
                url: withLocale(path, lang),
                nodeId: node.id,
                nodeType: node.type,
                label: node.label,
                navInclude: node.navInclude,
                navLabel: node.navLabel,
                sitemapInclude: node.sitemapInclude,
                sitemapPriority: node.sitemapPriority ?? 0.5,
                sitemapChangefreq: node.sitemapChangefreq,
                entryId,
                modelId,
                ...(lang && { locale: lang.locale })
            });
        };

        function walk(nodeId: string | null, pathSoFar: string): void {
            const children = childMap.get(nodeId) ?? [];
            for (const node of children) {
                let prefix = pathSoFar;
                const slug = slugIn(node, lang);
                if (slug) prefix = prefix ? `${prefix}/${slug}` : `/${slug}`;
                if (node.type === 'static') {
                    const sp = node as StaticPage;
                    const finalUrl = prefix || '/';
                    if (sp.status === 'published') emit(node, finalUrl);
                } else if (node.type === 'folder') {
                    walk(node.id, prefix);
                } else if (node.type === 'collection') {
                    const cn = node as CollectionPage;
                    if (cn.status !== 'published') continue;
                    emit(cn, prefix || '/');
                    const pattern = cn.urlPattern ?? '';
                    if (pattern && cn.sitemapIncludeEntries !== false) {
                        const idx = collectionNodes.findIndex(c => c.id === cn.id);
                        const entries = entryLists[idx] ?? [];
                        for (const entry of entries) {
                            const segment = interpolatePattern(pattern, entry, lang);
                            if (!segment) continue;
                            emit(cn, joinPath(prefix, segment), entry.id, cn.modelId);
                        }
                    }
                }
            }
        }

        walk(null, '');
        return rows;
    }

    if (!languages) return walkIn(undefined);

    const byLanguage = languagesList(languages).map(walkIn);
    const key = (r: ResolvedUrl) => `${r.nodeId}|${r.entryId ?? ''}`;
    const defaultUrls = new Map(byLanguage[0].map(r => [key(r), r.url]));
    for (const [i, rows] of byLanguage.entries()) {
        for (const row of rows) {
            // Same address as the default language: the same page, listed once.
            if (i > 0 && defaultUrls.get(key(row)) === row.url) continue;
            results.push(row);
        }
    }
    const alternates = new Map<string, Record<string, string>>();
    for (const row of results) {
        const k = key(row);
        alternates.set(k, { ...alternates.get(k), [row.locale!]: row.url });
    }
    for (const row of results) row.alternates = alternates.get(key(row));
    return results;
}

export type BreadcrumbItem = {
    label: string;
    url: string;
    nodeId: string;
    entryId?: string;
};

/** Resolve the URL and breadcrumb trail for a specific page node, or for a specific entry within a collection page, in one language when given. */
export function resolveBreadcrumb(
    nodeId: string,
    nodeMap: Map<string, PageNode>,
    entry?: Entry,
    lang?: UrlLanguage
): { url: string; breadcrumb: BreadcrumbItem[] } {
    const node = nodeMap.get(nodeId);
    if (!node) return { url: '', breadcrumb: [] };

    const ancestors = getAncestors(nodeId, nodeMap);
    const breadcrumb: BreadcrumbItem[] = [];
    let pathSoFar = '';
    const add = (n: PageNode) => {
        const slug = slugIn(n, lang);
        if (slug) pathSoFar += '/' + slug;
    };

    for (const a of ancestors) {
        add(a);
        breadcrumb.push({
            label: a.navLabel ?? a.label,
            url: withLocale(pathSoFar || '/', lang),
            nodeId: a.id
        });
    }

    add(node);
    const prefix = pathSoFar || '/';
    let currentUrl = withLocale(prefix, lang);
    breadcrumb.push({ label: node.navLabel ?? node.label, url: currentUrl, nodeId: node.id });
    if (node.type === 'collection' && entry && (node as CollectionPage).urlPattern) {
        const segment = interpolatePattern((node as CollectionPage).urlPattern!, entry, lang);
        currentUrl = withLocale(joinPath(prefix, segment), lang);
        const title = (entry.data as Record<string, unknown>)?.title;
        breadcrumb.push({
            label: textIn(title, lang) || entry.id,
            url: currentUrl,
            nodeId: node.id,
            entryId: entry.id
        });
    }

    return { url: currentUrl, breadcrumb };
}

export type NavigationNode = {
    id: string;
    label: string;
    url: string;
    type: PageNodeType;
    children?: NavigationNode[];
};

/** Whether a page may appear on the site: published, or a folder (it shows what's inside). */
export function isShown(node: PageNode): boolean {
    return node.type === 'folder' || node.status === 'published';
}

/**
 * Build navigation tree: only published nodes with navInclude (a draft page and what's under it
 * stay out); folders only if they have nav-included descendants.
 * depth: max depth (default all). rootId: start from this node's children (default root).
 */
export function buildNavigationTree(
    nodes: PageNode[],
    nodeMap: Map<string, PageNode>,
    childMap: Map<string | null, PageNode[]>,
    options: { depth?: number; rootId?: string | null; lang?: UrlLanguage } = {}
): NavigationNode[] {
    const { depth = 999, rootId, lang } = options;
    const parentId = rootId === undefined || rootId === null ? null : rootId;

    function hasNavIncludedDescendant(node: PageNode, d: number): boolean {
        if (d <= 0) return false;
        const children = childMap.get(node.id) ?? [];
        return children.some(
            c =>
                isShown(c) &&
                ((c.navInclude && c.type !== 'folder') || hasNavIncludedDescendant(c, d - 1))
        );
    }

    function build(pid: string | null, d: number): NavigationNode[] {
        if (d <= 0) return [];
        const children = childMap.get(pid) ?? [];
        const out: NavigationNode[] = [];
        for (const node of children) {
            if (!node.navInclude || !isShown(node)) continue;
            if (node.type === 'folder' && !hasNavIncludedDescendant(node, depth)) continue;
            const url = resolveNodePrefix(node.id, nodeMap, lang) || '/';
            const navNode: NavigationNode = {
                id: node.id,
                label: node.navLabel ?? node.label,
                url,
                type: node.type
            };
            if (
                d > 1 &&
                (node.type === 'folder' || node.type === 'static' || node.type === 'collection')
            ) {
                const sub = build(node.id, d - 1);
                if (sub.length) navNode.children = sub;
            }
            out.push(navNode);
        }
        return out;
    }

    return build(parentId, depth);
}
