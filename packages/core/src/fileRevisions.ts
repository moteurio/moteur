/**
 * Git revision history for any project-relative file path (pages, layouts, …).
 */
import { getLog, show, type CommitInfo } from './git/gitService.js';
import { projectDir } from './utils/pathUtils.js';

export type FileRevision = {
    id: string;
    number: number;
    message: string;
    savedAt: string;
    savedBy?: string;
};

function revisionsFromLog(commits: CommitInfo[]): FileRevision[] {
    return commits.map((c, i) => ({
        id: c.hash,
        number: commits.length - i,
        message: c.message,
        savedAt: c.date,
        savedBy: c.authorName
    }));
}

export function getFileRevisions(
    projectId: string,
    relativePath: string,
    maxCount = 20
): FileRevision[] {
    const commits = getLog(projectDir(projectId), relativePath, maxCount);
    return revisionsFromLog(commits);
}

export function getFileAtRevision(
    projectId: string,
    relativePath: string,
    revisionId: string
): Record<string, unknown> | null {
    if (!/^[0-9a-f]{7,40}$/i.test(revisionId)) return null;
    const raw = show(projectDir(projectId), revisionId, relativePath);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}
