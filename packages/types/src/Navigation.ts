import type { Field } from './Field.js';

export type NavItemLinkType = 'page' | 'custom' | 'asset' | 'none';

export interface NavItemBase {
    id: string;
    /** Plain text, or a map from locale code to string such as `{ fr: 'Accueil', en: 'Home' }`. */
    label: string | Record<string, string>;
    linkType: NavItemLinkType;

    /** Used when `linkType` is `page`. The page's URL is resolved at read time. */
    pageId?: string;
    /** Used when `linkType` is `custom`, for example `https://...` or `#anchor`. */
    customUrl?: string;
    /** Used when `linkType` is `asset`. Resolved to the asset's `url` at read time. */
    assetId?: string;

    /** When true, the link opens in a new tab. Defaults to false. Ignored when `linkType` is `none`. */
    openInNewTab?: boolean;

    /** Custom field values, in the same shape as entry fields. The schema is defined by the navigation's `itemSchema` and shared by all items. */
    fields: Record<string, unknown>;

    /** Nested items. The service enforces the navigation's `maxDepth`. */
    children?: NavItem[];
}

export type NavItem = NavItemBase;

/** The purpose of a navigation: a site menu, a sitemap, or a custom list. */
export type NavigationType = 'menu' | 'sitemap' | 'custom';

export interface Navigation {
    id: string;
    projectId: string;
    /** Display name, for example 'Header', 'Footer' or 'Mobile'. */
    name: string;
    /** URL-safe identifier, unique within the project, for example `header` or `footer`. The public API uses it to fetch the navigation. */
    handle: string;
    /** What the navigation is for: `menu` (site navigation), `sitemap` or `custom`. */
    type?: NavigationType;
    /** Maximum nesting depth, from 1 to 5. Defaults to 3. */
    maxDepth: number;
    /** Definitions of the custom fields available on every item, using the same `Field` type as models. */
    itemSchema?: Field[];
    items: NavItem[];
    createdAt: string;
    updatedAt: string;
}

/** A navigation item with URLs and assets resolved. Returned by the public API and never stored. */
export interface ResolvedNavItem extends Omit<NavItemBase, 'pageId' | 'assetId' | 'children'> {
    /** Resolved from the page, from `customUrl`, or from the asset's `url`. */
    url?: string;
    children?: ResolvedNavItem[];
}

export interface ResolvedNavigation extends Omit<Navigation, 'items'> {
    items: ResolvedNavItem[];
}
