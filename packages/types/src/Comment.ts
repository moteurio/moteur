export type CommentResourceType = 'entry' | 'layout' | 'page';

export interface Comment {
    id: string;
    projectId: string;
    resourceType: CommentResourceType;
    resourceId: string; // modelId__entryId for entries, layoutId for layouts
    fieldPath?: string; // dot-notation path to a specific field (e.g. "hero.title")
    blockId?: string; // ID of a specific block within a layout
    parentId?: string; // for replies (one level deep)
    body: string; // plain text
    authorId: string;
    authorName: string;
    resolved: boolean; // default false
    resolvedBy?: string; // userId who resolved it
    resolvedAt?: string; // ISO string
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
}

export interface CommentInput {
    resourceType: CommentResourceType;
    resourceId: string;
    fieldPath?: string;
    blockId?: string;
    parentId?: string;
    body: string;
}

export interface GetCommentsOptions {
    includeResolved?: boolean; // default false
    fieldPath?: string; // filter by field path
}
