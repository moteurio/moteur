export type PageNodeType = 'static' | 'collection' | 'folder';
export type PageStatus = 'published' | 'draft';

/** Shared fields across all page node types */
export interface PageNodeBase {
    id: string;
    projectId: string;
    type: PageNodeType;
    label: string;
    /** The address segment in the project's default language. */
    slug: string;
    /** The address segment in other languages, by locale. A language left out uses `slug`. */
    slugs?: Record<string, string>;
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

/** Static page — authored content, resolves to one URL */
export interface StaticPage extends PageNodeBase {
    type: 'static';
    templateId: string;
    status: PageStatus;
    fields: Record<string, unknown>;
    /**
     * The commit holding the page as published: sites are served that version. Edits saved
     * since by someone who needs a review wait in the page until it is published again.
     */
    publishedCommit?: string;
    publishedAt?: string;
}

/** Collection page — bound to a model, resolves to N URLs (one per entry) */
export interface CollectionPage extends PageNodeBase {
    type: 'collection';
    templateId: string;
    status: PageStatus;
    fields: Record<string, unknown>;
    /**
     * The commit holding the page as published: sites are served that version. Edits saved
     * since by someone who needs a review wait in the page until it is published again.
     */
    publishedCommit?: string;
    publishedAt?: string;
    modelId: string;
    urlPattern?: string;
    entryStatus?: PageStatus;
    sitemapIncludeEntries?: boolean;
}

/** Folder — structural grouping, no content of its own */
export interface FolderPage extends PageNodeBase {
    type: 'folder';
}

export type PageNode = StaticPage | CollectionPage | FolderPage;
