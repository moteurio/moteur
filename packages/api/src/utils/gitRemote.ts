import { URL } from 'url';

/**
 * The server clones from and pushes to a project's Git remote with its own filesystem and keys,
 * so a project's remote is an `https://` address: a local path, `file://` or SSH could reach
 * another project's repository on the host. No role changes that.
 */
export function gitRemoteRefusal(git: { remoteUrl?: unknown } | null | undefined): string | null {
    const remote = typeof git?.remoteUrl === 'string' ? git.remoteUrl.trim() : '';
    if (!remote) return null;
    let url: URL;
    try {
        url = new URL(remote);
    } catch {
        // Not a URL: a path or an scp-style SSH address.
        return 'Git remote must be an https:// address';
    }
    if (url.protocol !== 'https:') return 'Git remote must be an https:// address';
    // The address is saved in project.json, which every save commits and pushes.
    if (url.username || url.password)
        return 'Git remote must not contain a password or token: it would be committed with the project';
    return null;
}
