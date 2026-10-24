import { URL } from 'url';

/**
 * The server clones from and pushes to a project's Git remote with its own filesystem and keys,
 * so a project's remote is an `https://` address: a local path, `file://` or SSH could reach
 * another project's repository on the host. No role changes that.
 */
export function gitRemoteRefusal(git: { remoteUrl?: unknown } | null | undefined): string | null {
    const remote = typeof git?.remoteUrl === 'string' ? git.remoteUrl.trim() : '';
    if (!remote) return null;
    try {
        if (new URL(remote).protocol === 'https:') return null;
    } catch {
        // Not a URL: a path or an scp-style SSH address.
    }
    return 'Git remote must be an https:// address';
}
