import type {
    PageNode,
    PageNodeType,
    StaticPage,
    CollectionPage,
    PageStatus
} from '@moteurio/types/Page.js';
import type { Entry } from '@moteurio/types/Model.js';

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
};

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

/** Resolve the full URL prefix for a node by walking up the tree. Root-level nodes with slug '' contribute nothing. Returns a string beginning with '/' e.g. '/blog', '/shop/products' */
export function resolveNodePrefix(nodeId: string, nodeMap: Map<string, PageNode>): string {
    const ancestors = getAncestors(nodeId, nodeMap);
    const node = nodeMap.get(nodeId);
    const segments: string[] = [];
    for (const a of ancestors) if (a.slug) segments.push(a.slug);
    if (node?.slug) segments.push(node.slug);
    return segments.length === 0 ? '/' : '/' + segments.join('/');
}

/** Get a value from entry.data by dot path. Supports nested objects; if the path resolves to a string/number, return it; otherwise ''.
 * Never throws — unknown paths return ''. */
function getDataByPath(data: Record<string, unknown>, path: string): string {
    const parts = path.trim().split('.');
    let current: unknown = data;
    for (const p of parts) {
        if (current == null || typeof current !== 'object') return '';
        current = (current as Record<string, unknown>)[p];
    }
    if (current == null) return '';
    return String(current);
}

/** Interpolate a URL pattern against an entry's data. Supports dot notation: '[category.slug]' reads entry.data.category.slug or entry.data.category (if string). Unknown references resolve to '' (never throw). */
export function interpolatePattern(pattern: string, entry: Entry): string {
    return pattern.replace(/\[([^\]]+)\]/g, (_, ref: string) => {
        const trimmed = ref.trim();
        if (!trimmed) return '';
        return getDataByPath(entry.data ?? {}, trimmed);
    });
}

type EmitRow = (node: PageNode, url: string, entryId?: string, modelId?: string) => void;

/** Resolve all public URLs for sitemap / listing. */
export async function resolveAllUrls(
    nodes: PageNode[],
    getEntries: (projectId: string, modelId: string, status?: PageStatus) => Promise<Entry[]>,
    projectId: string
): Promise<ResolvedUrl[]> {
    const results: ResolvedUrl[] = [];
    const childMap = buildChildMap(nodes);

    const emit: EmitRow = (node, url, entryId, modelId) => {
        results.push({
            url,
            nodeId: node.id,
            nodeType: node.type,
            label: node.label,
            navInclude: node.navInclude,
            navLabel: node.navLabel,
            sitemapInclude: node.sitemapInclude,
            sitemapPriority: node.sitemapPriority ?? 0.5,
            sitemapChangefreq: node.sitemapChangefreq,
            entryId,
            modelId
        });
    };

    const collectionNodes = nodes.filter((n): n is CollectionPage => n.type === 'collection');

    const entryLists = await Promise.all(
        collectionNodes.map(cn => getEntries(projectId, cn.modelId, cn.entryStatus))
    );

    function walk(nodeId: string | null, pathSoFar: string): void {
        const children = childMap.get(nodeId) ?? [];
        for (const node of children) {
            let prefix = pathSoFar;
            if (node.slug) prefix = prefix ? `${prefix}/${node.slug}` : `/${node.slug}`;
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
                        const segment = interpolatePattern(pattern, entry);
                        if (!segment) continue;
                        const path = prefix ? `${prefix}/${segment}` : `/${segment}`;
                        emit(cn, path, entry.id, cn.modelId);
                    }
                }
            }
        }
    }

    walk(null, '');

    return results;
}

export type BreadcrumbItem = {
    label: string;
    url: string;
    nodeId: string;
    entryId?: string;
};

/** Resolve the URL and breadcrumb trail for a specific page node, or for a specific entry within a collection page. */
export function resolveBreadcrumb(
    nodeId: string,
    nodeMap: Map<string, PageNode>,
    entry?: Entry
): { url: string; breadcrumb: BreadcrumbItem[] } {
    const node = nodeMap.get(nodeId);
    if (!node) return { url: '', breadcrumb: [] };

    const ancestors = getAncestors(nodeId, nodeMap);
    const breadcrumb: BreadcrumbItem[] = [];
    let pathSoFar = '';

    for (const a of ancestors) {
        if (a.slug) pathSoFar += (pathSoFar ? '/' : '/') + a.slug;
        const url = pathSoFar || '/';
        breadcrumb.push({
            label: a.navLabel ?? a.label,
            url,
            nodeId: a.id
        });
    }

    let currentUrl: string;
    if (node.type === 'folder') {
        if (node.slug) pathSoFar += (pathSoFar ? '/' : '/') + node.slug;
        currentUrl = pathSoFar || '/';
        breadcrumb.push({ label: node.navLabel ?? node.label, url: currentUrl, nodeId: node.id });
    } else if (node.type === 'collection' && entry && (node as CollectionPage).urlPattern) {
        const pattern = (node as CollectionPage).urlPattern!;
        const segment = interpolatePattern(pattern, entry);
        if (node.slug) pathSoFar += (pathSoFar ? '/' : '/') + node.slug;
        const prefix = pathSoFar || '/';
        currentUrl = segment ? `${prefix}/${segment}` : prefix;
        breadcrumb.push({
            label: node.navLabel ?? node.label,
            url: prefix,
            nodeId: node.id
        });
        breadcrumb.push({
            label: ((entry.data as Record<string, unknown>)?.title as string) ?? entry.id,
            url: currentUrl,
            nodeId: node.id,
            entryId: entry.id
        });
    } else {
        if (node.slug) pathSoFar += (pathSoFar ? '/' : '/') + node.slug;
        currentUrl = pathSoFar || '/';
        breadcrumb.push({
            label: node.navLabel ?? node.label,
            url: currentUrl,
            nodeId: node.id
        });
    }

    return { url: currentUrl!, breadcrumb };
}

export type NavigationNode = {
    id: string;
    label: string;
    url: string;
    type: PageNodeType;
    children?: NavigationNode[];
};

/**
 * Build navigation tree: only nodes with navInclude; folders only if they have nav-included descendants.
 * depth: max depth (default all). rootId: start from this node's children (default root).
 */
export function buildNavigationTree(
    nodes: PageNode[],
    nodeMap: Map<string, PageNode>,
    childMap: Map<string | null, PageNode[]>,
    options: { depth?: number; rootId?: string | null } = {}
): NavigationNode[] {
    const { depth = 999, rootId } = options;
    const parentId = rootId === undefined || rootId === null ? null : rootId;

    function hasNavIncludedDescendant(node: PageNode, d: number): boolean {
        if (d <= 0) return false;
        if (node.navInclude && node.type !== 'folder') return true;
        const children = childMap.get(node.id) ?? [];
        return children.some(c => c.navInclude || hasNavIncludedDescendant(c, d - 1));
    }

    function build(pid: string | null, d: number): NavigationNode[] {
        if (d <= 0) return [];
        const children = childMap.get(pid) ?? [];
        const out: NavigationNode[] = [];
        for (const node of children) {
            if (!node.navInclude) continue;
            if (node.type === 'folder' && !hasNavIncludedDescendant(node, depth)) continue;
            const url = resolveNodePrefix(node.id, nodeMap) || '/';
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
