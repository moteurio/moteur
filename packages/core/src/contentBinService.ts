import type { User } from '@moteurio/types/User.js';
import { hasRole } from '@moteurio/types';
import { contentForbidden } from './contentAccess.js';
import { getProject } from './projects.js';
import { getBinItem, listBinItems, removeFromBin, type BinItem } from './contentBin.js';
import { restoreEntryFromBin } from './entries.js';
import { restorePageFromBin } from './pages.js';
import { restoreModelFromBin } from './models.js';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import type { PageNode } from '@moteurio/types/Page.js';

/**
 * The bin for entries, pages and models, for people: any member sees it, whoever may write takes
 * entries and pages out (back as drafts), builders take models out (entries and all), and what is
 * deleted for good is a content lead's (or an admin's) call. A model with its entries is a
 * builder's too, so deleting one for good takes both.
 */

/** Who may delete from the bin for good. */
export function canEmptyContentBin(user: User): boolean {
    return hasRole(user, 'lead');
}

function assertCanEmpty(user: User, items: BinItem[]): void {
    if (!canEmptyContentBin(user))
        throw contentForbidden('Only a content lead or an admin can delete content for good.');
    if (items.some(item => item.kind === 'model') && !hasRole(user, 'builder'))
        throw contentForbidden('Deleting a model for good also takes a builder.');
}

/** What is in the project's bin, most recently deleted first. */
export async function listContentBin(projectId: string, user: User): Promise<BinItem[]> {
    await getProject(user, projectId);
    return listBinItems(projectId);
}

/** Takes an entry or page out of the bin, as a draft; a model, with its entries as drafts. */
export async function restoreFromContentBin(
    projectId: string,
    user: User,
    binId: string
): Promise<
    | { kind: 'entry'; modelId: string; entry: Entry }
    | { kind: 'page'; page: PageNode }
    | { kind: 'model'; model: ModelSchema; entryCount: number }
> {
    await getProject(user, projectId);
    const item = getBinItem(projectId, binId);
    if (item.kind === 'model')
        return { kind: 'model', ...(await restoreModelFromBin(user, projectId, binId)) };
    if (item.kind === 'entry')
        return {
            kind: 'entry',
            modelId: item.modelId,
            entry: await restoreEntryFromBin(user, projectId, binId)
        };
    return { kind: 'page', page: await restorePageFromBin(projectId, user, binId) };
}

/** Deletes one thing in the bin for good. Content leads and admins (and builders, for a model). */
export async function deleteFromContentBin(
    projectId: string,
    user: User,
    binId: string
): Promise<void> {
    assertCanEmpty(user, []);
    await getProject(user, projectId);
    assertCanEmpty(user, [getBinItem(projectId, binId)]);
    removeFromBin(projectId, binId);
}

/** Empties the bin: everything in it deleted for good. Content leads and admins. How many went. */
export async function emptyContentBin(projectId: string, user: User): Promise<number> {
    assertCanEmpty(user, []);
    await getProject(user, projectId);
    const items = listBinItems(projectId);
    assertCanEmpty(user, items);
    for (const item of items) removeFromBin(projectId, item.id);
    return items.length;
}
