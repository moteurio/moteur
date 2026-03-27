import type { Field } from './Field.js';

export type NavItemLinkType = 'page' | 'custom' | 'asset' | 'none';

export interface NavItemBase {
    id: string;
    label: string;
    linkType: NavItemLinkType;

    /** linkType: 'page' — resolved to URL at read time */
    pageId?: string;
    /** linkType: 'custom' — e.g. 'https://...' or '#anchor' */
    customUrl?: string;
    /** linkType: 'asset' — resolved to asset.url at read time */
    assetId?: string;

    /** default false; ignored when linkType is 'none' */
    openInNewTab?: boolean;

    /** Custom fields — same shape as entry fields. Schema is defined on the Navigation (shared across all items). */
    fields: Record<string, unknown>;

    /** Nested items; depth limit enforced at service level */
    children?: NavItem[];
}

export type NavItem = NavItemBase;

/** Navigation purpose / display type. */
export type NavigationType = 'menu' | 'sitemap' | 'custom';

export interface Navigation {
    id: string;
    projectId: string;
    /** e.g. 'Header', 'Footer', 'Mobile' */
    name: string;
    /** URL-safe, unique per project e.g. 'header', 'footer'. Used to fetch by name in the public API. */
    handle: string;
    /** Purpose: menu (site nav), sitemap, or custom. */
    type?: NavigationType;
    /** max nesting depth (default 3, min 1, max 5) */
    maxDepth: number;
    /** Custom field definitions for all items. Uses the same Field type as models. */
    itemSchema?: Field[];
    items: NavItem[];
    createdAt: string;
    updatedAt: string;
}

/** Resolved navigation — URLs hydrated, assets resolved. Returned by public API; never stored. */
export interface ResolvedNavItem extends Omit<NavItemBase, 'pageId' | 'assetId' | 'children'> {
    /** resolved from pageId, customUrl, or asset.url */
    url?: string;
    children?: ResolvedNavItem[];
}

export interface ResolvedNavigation extends Omit<Navigation, 'items'> {
    items: ResolvedNavItem[];
}
