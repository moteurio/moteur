export type PageNodeType = 'static' | 'collection' | 'folder';
export type PageStatus = 'published' | 'draft';

/** Fields shared by all page node types. */
export interface PageNodeBase {
    id: string;
    projectId: string;
    type: PageNodeType;
    label: string;
    /** URL segment in the project's default locale. */
    slug: string;
    /** URL segments in other locales, keyed by locale code. A locale that is not listed uses `slug`. */
    slugs?: Record<string, string>;
    /**
     * Locales the page exists in. The default locale is always included. When omitted, the page
     * exists in every locale of the project. A locale that is not listed gets no URL, sitemap entry
     * or hreflang, and links to the page in that locale point to the default locale's URL.
     */
    languages?: string[];
    parentId: string | null;
    order: number;
    navInclude: boolean;
    navLabel?: string;
    sitemapInclude: boolean;
    sitemapPriority?: number;
    sitemapChangefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    createdAt: string;
    updatedAt: string;
}

/** A static page: authored content that resolves to one URL. */
export interface StaticPage extends PageNodeBase {
    type: 'static';
    templateId: string;
    status: PageStatus;
    fields: Record<string, unknown>;
    /**
     * The commit that holds the published version of the page. Sites are served this version.
     * Edits saved afterwards by a user who needs review stay unpublished on the page until it is
     * published again.
     */
    publishedCommit?: string;
    publishedAt?: string;
    /** Included only in API responses to project members and never stored. True when a published page has saved edits that are not yet live. */
    waitingChanges?: boolean;
}

/** A collection page: bound to a model, it resolves to one URL per entry. */
export interface CollectionPage extends PageNodeBase {
    type: 'collection';
    templateId: string;
    status: PageStatus;
    fields: Record<string, unknown>;
    /**
     * The commit that holds the published version of the page. Sites are served this version.
     * Edits saved afterwards by a user who needs review stay unpublished on the page until it is
     * published again.
     */
    publishedCommit?: string;
    publishedAt?: string;
    /** Included only in API responses to project members and never stored. True when a published page has saved edits that are not yet live. */
    waitingChanges?: boolean;
    modelId: string;
    urlPattern?: string;
    entryStatus?: PageStatus;
    sitemapIncludeEntries?: boolean;
}

/** A folder: a structural grouping of pages with no content of its own. */
export interface FolderPage extends PageNodeBase {
    type: 'folder';
}

export type PageNode = StaticPage | CollectionPage | FolderPage;
