import { URL } from 'url';
import { hasRole } from '@moteurio/types';
import type { User } from '@moteurio/types/User.js';

/**
 * The server clones from and pushes to a project's Git remote with its own filesystem and keys.
 * Only platform operators may point it at a local path, `file://` or SSH; everyone else gets
 * `https://` remotes, so one project cannot read or write another's repository on the host.
 */
export function gitRemoteRefusal(
    git: { remoteUrl?: unknown } | null | undefined,
    account: User | undefined
): string | null {
    const remote = typeof git?.remoteUrl === 'string' ? git.remoteUrl.trim() : '';
    if (!remote || hasRole(account, 'admin')) return null;
    try {
        if (new URL(remote).protocol === 'https:') return null;
    } catch {
        // Not a URL: a path or an scp-style SSH address.
    }
    return 'Git remote must be an https:// address';
}
