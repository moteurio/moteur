import type { User } from '@moteurio/types/User.js';
import { hasRole } from '@moteurio/types';
import { contentForbidden } from './contentAccess.js';
import { getProject } from './projects.js';
import { getBinItem, listBinItems, removeFromBin, type BinItem } from './contentBin.js';
import { restoreEntryFromBin } from './entries.js';
import { restorePageFromBin } from './pages.js';
import type { Entry } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';

/**
 * The bin for entries and pages, for people: any member sees it, whoever may write takes things
 * out (back as drafts), and what is deleted for good is a content lead's (or an admin's) call.
 */

/** Who may delete from the bin for good. */
export function canEmptyContentBin(user: User): boolean {
    return hasRole(user, 'lead');
}

function assertCanEmpty(user: User): void {
    if (!canEmptyContentBin(user))
        throw contentForbidden('Only a content lead or an admin can delete content for good.');
}

/** What is in the project's bin, most recently deleted first. */
export async function listContentBin(projectId: string, user: User): Promise<BinItem[]> {
    await getProject(user, projectId);
    return listBinItems(projectId);
}

/** Takes an entry or page out of the bin, as a draft. */
export async function restoreFromContentBin(
    projectId: string,
    user: User,
    binId: string
): Promise<{ kind: 'entry'; modelId: string; entry: Entry } | { kind: 'page'; page: PageNode }> {
    await getProject(user, projectId);
    const item = getBinItem(projectId, binId);
    if (item.kind === 'entry')
        return {
            kind: 'entry',
            modelId: item.modelId,
            entry: await restoreEntryFromBin(user, projectId, binId)
        };
    return { kind: 'page', page: await restorePageFromBin(projectId, user, binId) };
}

/** Deletes one thing in the bin for good. Content leads and admins. */
export async function deleteFromContentBin(
    projectId: string,
    user: User,
    binId: string
): Promise<void> {
    assertCanEmpty(user);
    await getProject(user, projectId);
    removeFromBin(projectId, binId);
}

/** Empties the bin: everything in it deleted for good. Content leads and admins. How many went. */
export async function emptyContentBin(projectId: string, user: User): Promise<number> {
    assertCanEmpty(user);
    await getProject(user, projectId);
    const items = listBinItems(projectId);
    for (const item of items) removeFromBin(projectId, item.id);
    return items.length;
}
