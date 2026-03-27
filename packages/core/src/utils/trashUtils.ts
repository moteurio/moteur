import fs from 'fs';
import path from 'path';

/**
 * Move a file or directory to a trash location.
 */
export function moveToTrash(sourcePath: string, trashPath: string): void {
    fs.mkdirSync(path.dirname(trashPath), { recursive: true });
    fs.renameSync(sourcePath, trashPath);
}

/**
 * Restore a file or directory from the trash.
 */
export function restoreFromTrash(trashPath: string, restorePath: string): void {
    fs.mkdirSync(path.dirname(restorePath), { recursive: true });
    fs.renameSync(trashPath, restorePath);
}

/**
 * Permanently delete a trashed file or directory.
 */
export function deleteTrashedItem(trashPath: string): void {
    if (fs.existsSync(trashPath)) {
        const stats = fs.statSync(trashPath);
        if (stats.isDirectory()) {
            fs.rmSync(trashPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(trashPath);
        }
    }
}
