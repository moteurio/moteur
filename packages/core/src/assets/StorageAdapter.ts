/**
 * Asset file storage adapter (physical file bytes and URLs).
 * Distinct from @moteurio/types Storage (project JSON storage).
 */
export interface UploadResult {
    path: string;
    url: string;
    size?: number;
}

export interface StorageAdapter {
    id: string;
    label: string;
    upload(
        projectId: string,
        filename: string,
        buffer: Buffer,
        mimeType: string,
        variantKey?: string
    ): Promise<UploadResult>;
    download(path: string): Promise<Buffer>;
    delete(path: string): Promise<void>;
    getUrl(path: string): Promise<string>;
    /**
     * Removes every file of one kind for a project (e.g. an image's resized copies). Optional:
     * storages without it keep those files until cleaned up by hand.
     */
    deleteFolder?(projectId: string, variantKey: string): Promise<void>;
}
