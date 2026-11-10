export type CommentResourceType = 'entry' | 'layout' | 'page';

export interface Comment {
    id: string;
    projectId: string;
    resourceType: CommentResourceType;
    resourceId: string; // `modelId__entryId` for entries, the layout ID for layouts
    fieldPath?: string; // Dot-notation path to a specific field (for example "hero.title")
    blockId?: string; // ID of a specific block within a layout
    parentId?: string; // ID of the parent comment, for replies. Replies nest one level deep
    body: string; // Plain text
    authorId: string;
    authorName: string;
    resolved: boolean; // Defaults to false
    resolvedBy?: string; // ID of the user who resolved the comment
    resolvedAt?: string; // ISO 8601 timestamp
    createdAt: string; // ISO 8601 timestamp
    updatedAt: string; // ISO 8601 timestamp
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
    includeResolved?: boolean; // Defaults to false
    fieldPath?: string; // Return only comments on this field path
}
