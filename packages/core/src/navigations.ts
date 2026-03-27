import { randomUUID } from 'crypto';
import type {
    Navigation,
    NavItem,
    ResolvedNavigation,
    ResolvedNavItem
} from '@moteurio/types/Navigation.js';
import type { Field } from '@moteurio/types/Field.js';
import type { User } from '@moteurio/types/User.js';
import { getProject } from './projects.js';
import { assertUserCanAccessProject } from './utils/access.js';
import { getProjectJson, putProjectJson } from './utils/projectStorage.js';
import { NAVIGATIONS_KEY } from './utils/storageKeys.js';
import { triggerEvent } from './utils/eventBus.js';
import { isValidId } from './utils/idUtils.js';
import type { PageNode } from '@moteurio/types/Page.js';
import { listPages } from './pages.js';
import { buildNodeMap, resolveNodePrefix } from './pages/urlResolver.js';
import { getAsset, resolveAssetUrl } from './assets/assetService.js';

const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const DEFAULT_MAX_DEPTH = 3;
const MIN_MAX_DEPTH = 1;
const MAX_MAX_DEPTH = 5;

function generateNavItemId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 12);
}

function ensureNavItemIds(items: NavItem[]): NavItem[] {
    return items.map(item => {
        const id = item.id && item.id.trim() ? item.id : generateNavItemId();
        const children =
            item.children && item.children.length > 0 ? ensureNavItemIds(item.children) : undefined;
        return { ...item, id, ...(children && { children }) };
    });
}

/** Returns false if any branch exceeds maxDepth. */
export function validateDepth(items: NavItem[], maxDepth: number, current: number = 1): boolean {
    if (current > maxDepth) return false;
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            if (!validateDepth(item.children, maxDepth, current + 1)) return false;
        }
    }
    return true;
}

function getDeepestDepth(items: NavItem[], current: number = 1): number {
    let max = current;
    for (const item of items) {
        if (item.children && item.children.length > 0) {
            const d = getDeepestDepth(item.children, current + 1);
            if (d > max) max = d;
        }
    }
    return max;
}

function isHandleUrlSafe(handle: string): boolean {
    if (!handle || handle.length === 0) return false;
    return HANDLE_REGEX.test(handle) && !handle.startsWith('-') && !handle.endsWith('-');
}

async function loadNavigations(projectId: string): Promise<Navigation[]> {
    const list = (await getProjectJson<Navigation[]>(projectId, NAVIGATIONS_KEY)) ?? [];
    return list;
}

async function saveNavigations(projectId: string, list: Navigation[]): Promise<void> {
    await putProjectJson(projectId, NAVIGATIONS_KEY, list);
}

export async function listNavigations(projectId: string): Promise<Navigation[]> {
    if (!isValidId(projectId)) {
        throw new Error(`Invalid projectId: "${projectId}"`);
    }
    return loadNavigations(projectId);
}

export async function getNavigation(projectId: string, id: string): Promise<Navigation> {
    if (!isValidId(projectId)) throw new Error(`Invalid projectId: "${projectId}"`);
    if (!id?.trim()) throw new Error('Invalid navigation id');
    const list = await loadNavigations(projectId);
    const nav = list.find(n => n.id === id);
    if (!nav) throw new Error(`Navigation "${id}" not found in project "${projectId}".`);
    return nav;
}

export async function getNavigationByHandle(
    projectId: string,
    handle: string
): Promise<Navigation | null> {
    if (!isValidId(projectId)) throw new Error(`Invalid projectId: "${projectId}"`);
    if (!handle?.trim()) return null;
    const list = await loadNavigations(projectId);
    return list.find(n => n.handle === handle) ?? null;
}

async function assertHandleUnique(
    projectId: string,
    handle: string,
    excludeId?: string
): Promise<void> {
    const list = await loadNavigations(projectId);
    const exists = list.some(n => n.handle === handle && (excludeId == null || n.id !== excludeId));
    if (exists) throw new Error(`A navigation with handle "${handle}" already exists.`);
}

async function assertPageIdsExist(projectId: string, items: NavItem[]): Promise<void> {
    const pages = await listPages(projectId);
    const pageIds = new Set(pages.map(p => p.id));
    const collectPageIds = (list: NavItem[]): string[] => {
        const ids: string[] = [];
        for (const item of list) {
            if (item.linkType === 'page' && item.pageId) ids.push(item.pageId);
            if (item.children) ids.push(...collectPageIds(item.children));
        }
        return ids;
    };
    const refs = collectPageIds(items);
    const missing = refs.filter(id => !pageIds.has(id));
    if (missing.length > 0) {
        throw new Error(`Page(s) not found: ${[...new Set(missing)].join(', ')}`);
    }
}

async function assertAssetIdsExist(projectId: string, items: NavItem[]): Promise<void> {
    const collectAssetIds = (list: NavItem[]): string[] => {
        const ids: string[] = [];
        for (const item of list) {
            if (item.linkType === 'asset' && item.assetId) ids.push(item.assetId);
            if (item.children) ids.push(...collectAssetIds(item.children));
        }
        return ids;
    };
    const refs = [...new Set(collectAssetIds(items))];
    for (const id of refs) {
        const asset = await getAsset(projectId, id);
        if (!asset) throw new Error(`Asset "${id}" not found.`);
    }
}

export interface CreateNavigationData {
    name: string;
    handle: string;
    type?: Navigation['type'];
    maxDepth?: number;
    itemSchema?: Field[];
    items?: NavItem[];
}

export async function createNavigation(
    projectId: string,
    user: User,
    data: CreateNavigationData
): Promise<Navigation> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);

    const handle = data.handle.trim().toLowerCase();
    if (!isHandleUrlSafe(handle)) {
        throw new Error(
            'Handle must be URL-safe: lowercase, alphanumeric and hyphens only (e.g. header, footer).'
        );
    }
    await assertHandleUnique(projectId, handle);

    const maxDepth = Math.min(
        MAX_MAX_DEPTH,
        Math.max(MIN_MAX_DEPTH, data.maxDepth ?? DEFAULT_MAX_DEPTH)
    );
    const items = ensureNavItemIds(data.items ?? []);
    if (!validateDepth(items, maxDepth)) {
        throw new Error(
            `Items exceed max depth (${maxDepth}). Reduce nesting or increase maxDepth (1–5).`
        );
    }
    await assertPageIdsExist(projectId, items);
    await assertAssetIdsExist(projectId, items);

    const id = randomUUID();
    const now = new Date().toISOString();
    const nav: Navigation = {
        id,
        projectId,
        name: data.name.trim(),
        handle,
        type: data.type ?? 'menu',
        maxDepth,
        itemSchema: data.itemSchema ?? [],
        items,
        createdAt: now,
        updatedAt: now
    };
    const list = await loadNavigations(projectId);
    list.push(nav);
    await saveNavigations(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [NAVIGATIONS_KEY],
        message: `Create navigation ${nav.handle} — ${user.name ?? user.id}`,
        user
    });
    return nav;
}

export interface UpdateNavigationPatch {
    name?: string;
    handle?: string;
    type?: Navigation['type'];
    maxDepth?: number;
    itemSchema?: Field[];
    items?: NavItem[];
}

export async function updateNavigation(
    projectId: string,
    user: User,
    id: string,
    patch: UpdateNavigationPatch
): Promise<Navigation> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    const list = await loadNavigations(projectId);
    const idx = list.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`Navigation "${id}" not found.`);

    const current = list[idx];
    let handle = current.handle;
    if (patch.handle !== undefined) {
        const next = patch.handle.trim().toLowerCase();
        if (!isHandleUrlSafe(next)) {
            throw new Error('Handle must be URL-safe: lowercase, alphanumeric and hyphens only.');
        }
        await assertHandleUnique(projectId, next, id);
        handle = next;
    }

    let maxDepth = current.maxDepth;
    if (patch.maxDepth !== undefined) {
        maxDepth = Math.min(MAX_MAX_DEPTH, Math.max(MIN_MAX_DEPTH, patch.maxDepth));
    }

    let items = current.items;
    if (patch.items !== undefined) {
        items = ensureNavItemIds(patch.items);
        if (!validateDepth(items, maxDepth)) {
            const deepest = getDeepestDepth(items);
            throw new Error(
                `Cannot set maxDepth to ${maxDepth}: existing items have depth up to ${deepest}. Remove or move nested items first.`
            );
        }
        await assertPageIdsExist(projectId, items);
        await assertAssetIdsExist(projectId, items);
    } else if (patch.maxDepth !== undefined && maxDepth < current.maxDepth) {
        if (!validateDepth(current.items, maxDepth)) {
            const deepest = getDeepestDepth(current.items);
            throw new Error(
                `Cannot set maxDepth to ${maxDepth}: existing items have depth up to ${deepest}. Remove or move nested items first.`
            );
        }
    }

    const updated: Navigation = {
        ...current,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        handle,
        type: patch.type !== undefined ? patch.type : current.type,
        maxDepth,
        itemSchema: patch.itemSchema !== undefined ? patch.itemSchema : current.itemSchema,
        items,
        updatedAt: new Date().toISOString()
    };
    list[idx] = updated;
    await saveNavigations(projectId, list);
    triggerEvent('content.saved', {
        projectId,
        paths: [NAVIGATIONS_KEY],
        message: `Update navigation ${id} — ${user.name ?? user.id}`,
        user
    });
    return updated;
}

export async function deleteNavigation(projectId: string, user: User, id: string): Promise<void> {
    const project = await getProject(user, projectId);
    assertUserCanAccessProject(user, project);
    const list = await loadNavigations(projectId);
    const filtered = list.filter(n => n.id !== id);
    if (filtered.length === list.length) throw new Error(`Navigation "${id}" not found.`);
    await saveNavigations(projectId, filtered);
    triggerEvent('content.saved', {
        projectId,
        paths: [NAVIGATIONS_KEY],
        message: `Delete navigation ${id} — ${user.name ?? user.id}`,
        user
    });
}

/** Resolve a single item's URL; never throws — returns undefined on missing refs. */
async function resolveItemUrl(
    projectId: string,
    item: NavItem,
    nodeMap: Map<string, PageNode>
): Promise<string | undefined> {
    switch (item.linkType) {
        case 'custom':
            return item.customUrl ?? undefined;
        case 'page': {
            if (!item.pageId) return undefined;
            const node = nodeMap.get(item.pageId);
            if (!node) return undefined;
            const prefix = resolveNodePrefix(item.pageId, nodeMap);
            return prefix || '/';
        }
        case 'asset': {
            if (!item.assetId) return undefined;
            const asset = await getAsset(projectId, item.assetId);
            if (!asset) return undefined;
            return resolveAssetUrl(asset);
        }
        case 'none':
        default:
            return undefined;
    }
}

async function resolveItem(
    projectId: string,
    item: NavItem,
    nodeMap: Map<string, PageNode>
): Promise<ResolvedNavItem> {
    const url = await resolveItemUrl(projectId, item, nodeMap);
    const { pageId: _p, assetId: _a, children, ...rest } = item;
    const resolved: ResolvedNavItem = {
        ...rest,
        ...(url !== undefined && { url })
    };
    if (children && children.length > 0) {
        resolved.children = await Promise.all(
            children.map(child => resolveItem(projectId, child, nodeMap))
        );
    }
    return resolved;
}

/** Resolve a navigation — hydrate all URLs and assets. Never throws on missing refs; url is undefined for those items. */
export async function resolveNavigation(
    projectId: string,
    navigation: Navigation
): Promise<ResolvedNavigation> {
    const pages = await listPages(projectId);
    const nodeMap = buildNodeMap(pages);
    const items = await Promise.all(
        navigation.items.map(item => resolveItem(projectId, item, nodeMap))
    );
    const { items: _i, ...rest } = navigation;
    return {
        ...rest,
        items
    };
}
